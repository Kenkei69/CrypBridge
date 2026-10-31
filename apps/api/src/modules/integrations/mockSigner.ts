import {
  AppError,
  type IPaymentSigner,
  type SigningRequest,
  type ApprovalSnapshot,
  type X402PaymentAuthorization,
  X402_SPECIFICATION_VERSION,
  SUPPORTED_SCHEMES,
} from '@x402/shared';

export class SimulationPaymentSigner implements IPaymentSigner {
  public readonly isSimulation = true;

  constructor(appEnv: string) {
    if (appEnv === 'production') {
      throw AppError.simulationForbidden('SimulationPaymentSigner is strictly prohibited in production');
    }
  }

  async signAuthorization(
    request: SigningRequest,
    snapshot: ApprovalSnapshot
  ): Promise<X402PaymentAuthorization> {
    // Defense-in-depth: Validate snapshot integrity before producing simulated signature
    if (snapshot.id !== request.snapshotId) {
      throw AppError.badRequest('Snapshot ID mismatch in signing request');
    }

    if (snapshot.exactAmount !== request.exactAmount) {
      throw AppError.badRequest('Amount mismatch with immutable approval snapshot');
    }

    if (snapshot.status !== 'active') {
      throw AppError.badRequest(`Cannot sign for approval snapshot in status: ${snapshot.status}`);
    }

    const expiresAt = new Date(snapshot.expiresAt).getTime();
    if (Date.now() > expiresAt) {
      throw AppError.badRequest('Approval snapshot has expired');
    }

    // Explicit simulated mock signature string - never a fake onchain hash
    const simulatedSignature = `SIMULATED_MOCK_SIGNATURE_SNAPSHOT_${snapshot.id}_V${snapshot.approvalVersion}`;

    return {
      version: X402_SPECIFICATION_VERSION,
      scheme: SUPPORTED_SCHEMES.EXACT_PAYMENT_V1,
      network: snapshot.networkIdentifier,
      asset: snapshot.assetIdentifier,
      amount: snapshot.exactAmount,
      recipient: snapshot.trustedRecipientAddress,
      signature: simulatedSignature,
      approvalReference: snapshot.id,
      simulated: true,
    };
  }
}
