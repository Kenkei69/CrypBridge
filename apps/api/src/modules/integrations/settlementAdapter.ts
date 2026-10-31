import { simulationAllowed } from '../../config/simulation.js';
import {
  AppError,
  type ISettlementAdapter,
  type X402PaymentAuthorization,
  type X402SettlementResult,
} from '@x402/shared';

export class SimulationSettlementAdapter implements ISettlementAdapter {
  public readonly isSimulation = true;

  constructor(appEnv: string) {
    if (!simulationAllowed(appEnv)) {
      throw AppError.simulationForbidden('SimulationSettlementAdapter is strictly prohibited in production');
    }
  }

  async submitSettlement(authorization: X402PaymentAuthorization): Promise<X402SettlementResult> {
    if (!authorization.simulated) {
      throw AppError.badRequest('Simulation settlement adapter only processes simulated authorizations');
    }

    return {
      settled: true,
      settlementType: 'simulated',
      settlementId: `sim_settle_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      network: authorization.network,
      asset: authorization.asset,
      amount: authorization.amount,
      timestamp: new Date().toISOString(),
    };
  }

  async reconcileSettlement(settlementId: string): Promise<X402SettlementResult> {
    if (!settlementId.startsWith('sim_settle_')) {
      throw AppError.badRequest('Invalid simulated settlement ID');
    }

    return {
      settled: true,
      settlementType: 'simulated',
      settlementId,
      network: 'simulation',
      asset: 'USDC',
      amount: '0',
      timestamp: new Date().toISOString(),
    };
  }
}
