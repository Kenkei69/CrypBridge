import { eq, and, sql, gte, inArray } from 'drizzle-orm';
import {
  AppError,
  type SpendingPolicy,
  type SpendingReservation,
  type UserBudgetSummary,
  type GuardianReasonCode,
} from '@x402/shared';
import {
  guardianPolicies,
  spendingReservations,
} from '@x402/database/schema';

export interface ReserveBudgetParams {
  userId: string;
  purchaseIntentId: string;
  paymentExecutionId?: string;
  taskId?: string;
  assetIdentifier: string;
  networkIdentifier: string;
  amount: string; // Base units integer string
  now?: Date;
}

export interface BudgetReservationResult {
  success: boolean;
  reservation?: SpendingReservation;
  reasonCode?: GuardianReasonCode;
  errorMessage?: string;
  budgetSummary: UserBudgetSummary;
}

/**
 * Calculates UTC calendar day window boundaries (00:00:00.000Z to 23:59:59.999Z)
 */
export function getUtcDailyWindow(now = new Date()): { windowStartedAt: Date; windowExpiresAt: Date; resetAtUtc: string } {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const date = now.getUTCDate();

  const windowStartedAt = new Date(Date.UTC(year, month, date, 0, 0, 0, 0));
  const windowExpiresAt = new Date(Date.UTC(year, month, date, 23, 59, 59, 999));

  const nextDay = new Date(Date.UTC(year, month, date + 1, 0, 0, 0, 0));
  const resetAtUtc = nextDay.toISOString();

  return { windowStartedAt, windowExpiresAt, resetAtUtc };
}

/**
 * Loads the effective active policy for a user and asset/network combination.
 * Prioritizes user-specific policy over global default policy (where userId IS NULL).
 */
export async function getEffectivePolicy(
  db: any,
  userId: string,
  assetIdentifier: string,
  networkIdentifier: string
): Promise<SpendingPolicy> {
  const normAsset = assetIdentifier.toUpperCase() === 'USDC' ? 'USDC' : assetIdentifier;

  // 1. Try to find user-specific active policy
  const userPolicies = await db
    .select()
    .from(guardianPolicies)
    .where(
      and(
        eq(guardianPolicies.userId, userId),
        eq(guardianPolicies.assetIdentifier, normAsset),
        eq(guardianPolicies.networkIdentifier, networkIdentifier),
        eq(guardianPolicies.isActive, true)
      )
    )
    .limit(1);

  if (userPolicies.length > 0) {
    return userPolicies[0];
  }

  // 2. Fall back to global system default policy
  const defaultPolicies = await db
    .select()
    .from(guardianPolicies)
    .where(
      and(
        sql`${guardianPolicies.userId} IS NULL`,
        eq(guardianPolicies.assetIdentifier, normAsset),
        eq(guardianPolicies.networkIdentifier, networkIdentifier),
        eq(guardianPolicies.isActive, true)
      )
    )
    .limit(1);

  if (defaultPolicies.length > 0) {
    return defaultPolicies[0];
  }

  // 3. Fall back to any active USDC on Base Sepolia default policy
  const fallbackPolicies = await db
    .select()
    .from(guardianPolicies)
    .where(
      and(
        sql`${guardianPolicies.userId} IS NULL`,
        eq(guardianPolicies.isActive, true)
      )
    )
    .limit(1);

  if (fallbackPolicies.length > 0) {
    return fallbackPolicies[0];
  }

  throw AppError.notFound(
    `No active guardian spending policy found for ${normAsset} on ${networkIdentifier}`
  );
}

/**
 * Retrieves the current budget summary for a user.
 */
export async function getUserBudgetSummary(
  db: any,
  userId: string,
  assetIdentifier = 'USDC',
  networkIdentifier = 'eip155:84532',
  now = new Date()
): Promise<UserBudgetSummary> {
  const policy = await getEffectivePolicy(db, userId, assetIdentifier, networkIdentifier);
  const { windowStartedAt, windowExpiresAt, resetAtUtc } = getUtcDailyWindow(now);

  const activeReservations = await db
    .select()
    .from(spendingReservations)
    .where(
      and(
        eq(spendingReservations.userId, userId),
        eq(spendingReservations.assetIdentifier, policy.assetIdentifier),
        eq(spendingReservations.networkIdentifier, policy.networkIdentifier),
        inArray(spendingReservations.reservationStatus, ['RESERVED', 'COMMITTED']),
        gte(spendingReservations.windowStartedAt, windowStartedAt)
      )
    );

  let settledBigInt = 0n;
  let reservedBigInt = 0n;

  for (const r of activeReservations) {
    const amt = BigInt(r.amount);
    if (r.reservationStatus === 'COMMITTED') {
      settledBigInt += amt;
    } else if (r.reservationStatus === 'RESERVED') {
      reservedBigInt += amt;
    }
  }

  const dailyLimitBigInt = BigInt(policy.maxAmountPerDailyWindow);
  const totalConsumedBigInt = settledBigInt + reservedBigInt;
  const availableBigInt = dailyLimitBigInt > totalConsumedBigInt ? dailyLimitBigInt - totalConsumedBigInt : 0n;

  return {
    userId,
    policyId: policy.id,
    policyVersion: policy.policyVersion,
    assetIdentifier: policy.assetIdentifier,
    networkIdentifier: policy.networkIdentifier,
    currency: 'USDC',
    decimals: 6,
    dailyLimitAmount: policy.maxAmountPerDailyWindow,
    settledAmount: settledBigInt.toString(),
    reservedAmount: reservedBigInt.toString(),
    availableAmount: availableBigInt.toString(),
    paymentLimitAmount: policy.maxAmountPerPayment,
    taskLimitAmount: policy.maxAmountPerTask,
    windowStartedAt: windowStartedAt.toISOString(),
    windowExpiresAt: windowExpiresAt.toISOString(),
    resetAtUtc,
  };
}

/**
 * Atomically evaluates spending limits and reserves budget inside a database transaction.
 * Uses row-level locking on the policy record to guarantee strict serialization under concurrency.
 */
export async function reserveSpendingBudget(
  db: any,
  params: ReserveBudgetParams
): Promise<BudgetReservationResult> {
  const now = params.now || new Date();
  const { windowStartedAt, windowExpiresAt, resetAtUtc } = getUtcDailyWindow(now);
  const proposedAmountBigInt = BigInt(params.amount);

  return await db.transaction(async (tx: any) => {
    // 1. Resolve and row-lock the policy record to serialize concurrent reservations
    const policy = await getEffectivePolicy(tx, params.userId, params.assetIdentifier, params.networkIdentifier);

    // Row-level lock on the policy row
    await tx.execute(
      sql`SELECT id FROM guardian_policies WHERE id = ${policy.id} FOR UPDATE`
    );

    // 2. Check if this payment execution already has an active reservation (idempotency/retry)
    if (params.paymentExecutionId) {
      const existing = await tx
        .select()
        .from(spendingReservations)
        .where(
          and(
            eq(spendingReservations.paymentExecutionId, params.paymentExecutionId),
            inArray(spendingReservations.reservationStatus, ['RESERVED', 'COMMITTED'])
          )
        )
        .limit(1);

      if (existing.length > 0) {
        const summary = await getUserBudgetSummary(tx, params.userId, policy.assetIdentifier, policy.networkIdentifier, now);
        return {
          success: true,
          reservation: existing[0],
          budgetSummary: summary,
        };
      }
    }

    // 3. Check if purchaseIntentId already has an active reservation
    const existingIntentRes = await tx
      .select()
      .from(spendingReservations)
      .where(
        and(
          eq(spendingReservations.purchaseIntentId, params.purchaseIntentId),
          inArray(spendingReservations.reservationStatus, ['RESERVED', 'COMMITTED'])
        )
      )
      .limit(1);

    if (existingIntentRes.length > 0) {
      const summary = await getUserBudgetSummary(tx, params.userId, policy.assetIdentifier, policy.networkIdentifier, now);
      return {
        success: true,
        reservation: existingIntentRes[0],
        budgetSummary: summary,
      };
    }

    // 4. Check Single-Payment Budget Limit
    const paymentLimitBigInt = BigInt(policy.maxAmountPerPayment);
    if (proposedAmountBigInt > paymentLimitBigInt) {
      const summary = await getUserBudgetSummary(tx, params.userId, policy.assetIdentifier, policy.networkIdentifier, now);
      return {
        success: false,
        reasonCode: 'BUDGET_EXCEEDED_PER_PAYMENT',
        errorMessage: `Payment amount (${params.amount}) exceeds single-payment budget limit (${policy.maxAmountPerPayment})`,
        budgetSummary: summary,
      };
    }

    // 5. Check Purchasing Task Budget Limit (if taskId provided)
    const taskId = params.taskId || params.purchaseIntentId;
    if (taskId) {
      const taskReservations = await tx
        .select()
        .from(spendingReservations)
        .where(
          and(
            eq(spendingReservations.userId, params.userId),
            eq(spendingReservations.taskId, taskId),
            inArray(spendingReservations.reservationStatus, ['RESERVED', 'COMMITTED'])
          )
        );

      let taskCurrentSpendBigInt = 0n;
      for (const r of taskReservations) {
        taskCurrentSpendBigInt += BigInt(r.amount);
      }

      const taskLimitBigInt = BigInt(policy.maxAmountPerTask);
      if (taskCurrentSpendBigInt + proposedAmountBigInt > taskLimitBigInt) {
        const summary = await getUserBudgetSummary(tx, params.userId, policy.assetIdentifier, policy.networkIdentifier, now);
        return {
          success: false,
          reasonCode: 'BUDGET_EXCEEDED_PER_TASK',
          errorMessage: `Cumulative spending for task '${taskId}' (${(taskCurrentSpendBigInt + proposedAmountBigInt).toString()}) exceeds task limit (${policy.maxAmountPerTask})`,
          budgetSummary: summary,
        };
      }
    }

    // 6. Check Daily UTC Window Budget Limit
    const dailyReservations = await tx
      .select()
      .from(spendingReservations)
      .where(
        and(
          eq(spendingReservations.userId, params.userId),
          eq(spendingReservations.assetIdentifier, policy.assetIdentifier),
          eq(spendingReservations.networkIdentifier, policy.networkIdentifier),
          inArray(spendingReservations.reservationStatus, ['RESERVED', 'COMMITTED']),
          gte(spendingReservations.windowStartedAt, windowStartedAt)
        )
      );

    let dailyCurrentSpendBigInt = 0n;
    let settledSpendBigInt = 0n;
    let reservedSpendBigInt = 0n;

    for (const r of dailyReservations) {
      const amt = BigInt(r.amount);
      dailyCurrentSpendBigInt += amt;
      if (r.reservationStatus === 'COMMITTED') {
        settledSpendBigInt += amt;
      } else {
        reservedSpendBigInt += amt;
      }
    }

    const dailyLimitBigInt = BigInt(policy.maxAmountPerDailyWindow);
    if (dailyCurrentSpendBigInt + proposedAmountBigInt > dailyLimitBigInt) {
      const summary: UserBudgetSummary = {
        userId: params.userId,
        policyId: policy.id,
        policyVersion: policy.policyVersion,
        assetIdentifier: policy.assetIdentifier,
        networkIdentifier: policy.networkIdentifier,
        currency: 'USDC',
        decimals: 6,
        dailyLimitAmount: policy.maxAmountPerDailyWindow,
        settledAmount: settledSpendBigInt.toString(),
        reservedAmount: reservedSpendBigInt.toString(),
        availableAmount: (dailyLimitBigInt > dailyCurrentSpendBigInt ? dailyLimitBigInt - dailyCurrentSpendBigInt : 0n).toString(),
        paymentLimitAmount: policy.maxAmountPerPayment,
        taskLimitAmount: policy.maxAmountPerTask,
        windowStartedAt: windowStartedAt.toISOString(),
        windowExpiresAt: windowExpiresAt.toISOString(),
        resetAtUtc,
      };

      return {
        success: false,
        reasonCode: 'BUDGET_EXCEEDED_DAILY',
        errorMessage: `Total daily spend (${(dailyCurrentSpendBigInt + proposedAmountBigInt).toString()}) exceeds daily window limit (${policy.maxAmountPerDailyWindow})`,
        budgetSummary: summary,
      };
    }

    // 7. Limits Satisfied: Insert New Reservation Record atomically
    const [insertedReservation] = await tx
      .insert(spendingReservations)
      .values({
        userId: params.userId,
        purchaseIntentId: params.purchaseIntentId,
        paymentExecutionId: params.paymentExecutionId || null,
        policyId: policy.id,
        policyVersion: policy.policyVersion,
        assetIdentifier: policy.assetIdentifier,
        networkIdentifier: policy.networkIdentifier,
        amount: params.amount,
        reservationStatus: 'RESERVED',
        taskId,
        windowStartedAt,
        windowExpiresAt,
      })
      .returning();

    // Recompute budget summary reflecting new reservation
    const newReservedBigInt = reservedSpendBigInt + proposedAmountBigInt;
    const newTotalConsumedBigInt = settledSpendBigInt + newReservedBigInt;
    const newAvailableBigInt = dailyLimitBigInt > newTotalConsumedBigInt ? dailyLimitBigInt - newTotalConsumedBigInt : 0n;

    const updatedSummary: UserBudgetSummary = {
      userId: params.userId,
      policyId: policy.id,
      policyVersion: policy.policyVersion,
      assetIdentifier: policy.assetIdentifier,
      networkIdentifier: policy.networkIdentifier,
      currency: 'USDC',
      decimals: 6,
      dailyLimitAmount: policy.maxAmountPerDailyWindow,
      settledAmount: settledSpendBigInt.toString(),
      reservedAmount: newReservedBigInt.toString(),
      availableAmount: newAvailableBigInt.toString(),
      paymentLimitAmount: policy.maxAmountPerPayment,
      taskLimitAmount: policy.maxAmountPerTask,
      windowStartedAt: windowStartedAt.toISOString(),
      windowExpiresAt: windowExpiresAt.toISOString(),
      resetAtUtc,
    };

    return {
      success: true,
      reservation: insertedReservation,
      budgetSummary: updatedSummary,
    };
  });
}

/**
 * Transitions a reservation to COMMITTED upon successful payment settlement.
 */
export async function commitSpendingReservation(
  db: any,
  reservationId: string,
  paymentExecutionId?: string
): Promise<SpendingReservation> {
  const updateData: Record<string, any> = {
    reservationStatus: 'COMMITTED',
    committedAt: new Date(),
    updatedAt: new Date(),
  };
  if (paymentExecutionId) {
    updateData.paymentExecutionId = paymentExecutionId;
  }

  const [updated] = await db
    .update(spendingReservations)
    .set(updateData)
    .where(eq(spendingReservations.id, reservationId))
    .returning();

  if (!updated) {
    throw AppError.notFound(`Spending reservation ${reservationId}`);
  }

  return updated;
}

/**
 * Safely releases a reservation when execution is definitively canceled or blocked before settlement.
 * NOTE: If reservation is already COMMITTED, it MUST NOT be released.
 */
export async function releaseSpendingReservation(
  db: any,
  reservationId: string,
  reason: string
): Promise<SpendingReservation | null> {
  const [existing] = await db
    .select()
    .from(spendingReservations)
    .where(eq(spendingReservations.id, reservationId))
    .limit(1);

  if (!existing) {
    return null;
  }

  // Safety invariant: Committed spend cannot be released
  if (existing.reservationStatus === 'COMMITTED') {
    return existing;
  }

  if (existing.reservationStatus === 'RELEASED') {
    return existing;
  }

  const [released] = await db
    .update(spendingReservations)
    .set({
      reservationStatus: 'RELEASED',
      releasedAt: new Date(),
      releaseReason: reason,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(spendingReservations.id, reservationId),
        eq(spendingReservations.reservationStatus, 'RESERVED')
      )
    )
    .returning();

  return released || existing;
}
