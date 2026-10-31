import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { AppError } from '@x402/shared';
import { getConfig } from '../../config/env.js';
import { MockMerchantService, type MockMerchantRequest } from './mockMerchantService.js';

export async function mockMerchantRoutes(app: FastifyInstance): Promise<void> {
  const env = getConfig();
  const merchantService = new MockMerchantService(app.db, env.APP_ENV);

  // GET /api/v1/mock-merchant/resources/:id - Mock Merchant demonstration paywalled resource endpoint
  app.get<{
    Params: { id: string };
    Querystring: { fault?: MockMerchantRequest['faultInjection'] };
  }>(
    '/api/v1/mock-merchant/resources/:id',
    async (request: FastifyRequest<{ Params: { id: string }; Querystring: { fault?: MockMerchantRequest['faultInjection'] } }>, reply: FastifyReply) => {
      const resourceId = request.params.id;
      const signatureHeader = (request.headers['payment-signature'] as string) || null;
      const fault = request.query.fault;

      if (fault && process.env.NODE_ENV !== 'test') {
        throw AppError.forbidden('Fault injection controls are restricted strictly to automated tests', 'FAULT_INJECTION_RESTRICTED');
      }

      const resp = await merchantService.handleResourceRequest({
        resourceId,
        paymentSignatureHeader: signatureHeader,
        faultInjection: fault,
      });

      for (const [key, value] of Object.entries(resp.headers)) {
        reply.header(key, value);
      }

      return reply.status(resp.status).send(resp.body);
    }
  );
}
