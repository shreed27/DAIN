/**
 * A2AProtocol - Agent-to-Agent Message Handling
 * Implements message creation, signing, and verification
 */

import { hashMessage, recoverMessageAddress, type Address, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import type {
  A2AMessage,
  SignedA2AMessage,
  A2ARequest,
  A2AResponse,
  A2AError,
  AgentId,
  A2APayment,
  A2AHandler,
  A2ASkillDefinition,
  A2AHandlerContext,
} from './types';
import { A2AMessageSchema, SignedA2AMessageSchema } from './types';

/**
 * Generate a UUID v4
 */
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * A2AProtocol - Static utility class for A2A message handling
 */
export class A2AProtocol {
  // ============================================================================
  // Message Creation
  // ============================================================================

  /**
   * Create a new A2A request message
   */
  static createRequest(params: {
    from: AgentId;
    to: string | AgentId;
    skill: string;
    payload: Record<string, unknown>;
    payment?: A2APayment;
  }): A2ARequest {
    const to = typeof params.to === 'string' ? { handle: params.to } : params.to;

    return {
      version: 'a2a-v1',
      id: generateUUID(),
      timestamp: new Date().toISOString(),
      from: params.from,
      to,
      type: 'request',
      skill: params.skill,
      payload: params.payload,
      payment: params.payment,
    };
  }

  /**
   * Create a response to a request
   */
  static createResponse(params: {
    from: AgentId;
    request: A2ARequest;
    success: boolean;
    data?: unknown;
    error?: string;
    paymentRequired?: {
      amount: string;
      address: Address;
      chainId: number;
    };
  }): A2AResponse {
    return {
      version: 'a2a-v1',
      id: generateUUID(),
      timestamp: new Date().toISOString(),
      from: params.from,
      to: params.request.from,
      type: 'response',
      replyTo: params.request.id,
      payload: {
        success: params.success,
        data: params.data,
        error: params.error,
        paymentRequired: params.paymentRequired,
      },
    };
  }

  /**
   * Create an error response
   */
  static createError(params: {
    from: AgentId;
    to: AgentId | { handle: string };
    code: string;
    message: string;
    details?: unknown;
    replyTo?: string;
  }): A2AError {
    return {
      version: 'a2a-v1',
      id: generateUUID(),
      timestamp: new Date().toISOString(),
      from: params.from,
      to: params.to,
      type: 'error',
      replyTo: params.replyTo,
      payload: {
        code: params.code,
        message: params.message,
        details: params.details,
      },
    };
  }

  // ============================================================================
  // Message Signing & Verification
  // ============================================================================

  /**
   * Sign an A2A message with a private key
   */
  static async sign(message: A2AMessage, privateKey: Hex): Promise<SignedA2AMessage> {
    const account = privateKeyToAccount(privateKey);

    // Create canonical message string for signing
    const messageString = JSON.stringify({
      version: message.version,
      id: message.id,
      timestamp: message.timestamp,
      from: message.from,
      to: message.to,
      type: message.type,
      skill: message.skill,
      payload: message.payload,
      payment: message.payment,
      replyTo: message.replyTo,
    });

    const signature = await account.signMessage({ message: messageString });

    return {
      ...message,
      signature,
      signer: account.address,
    };
  }

  /**
   * Verify a signed A2A message
   * Returns the signer address if valid, throws if invalid
   */
  static async verify(
    signedMessage: SignedA2AMessage
  ): Promise<{ valid: boolean; signer: Address }> {
    const { signature, signer, ...message } = signedMessage;

    // Recreate the canonical message string
    const messageString = JSON.stringify({
      version: message.version,
      id: message.id,
      timestamp: message.timestamp,
      from: message.from,
      to: message.to,
      type: message.type,
      skill: message.skill,
      payload: message.payload,
      payment: message.payment,
      replyTo: message.replyTo,
    });

    // Recover signer address
    const recoveredAddress = await recoverMessageAddress({
      message: messageString,
      signature,
    });

    // Verify signer matches claimed signer
    const valid = recoveredAddress.toLowerCase() === signer.toLowerCase();

    return { valid, signer: recoveredAddress };
  }

  // ============================================================================
  // Message Validation
  // ============================================================================

  /**
   * Validate an A2A message structure
   */
  static validate(message: unknown): { valid: boolean; errors?: string[] } {
    const result = A2AMessageSchema.safeParse(message);

    if (result.success) {
      return { valid: true };
    }

    return {
      valid: false,
      errors: result.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`),
    };
  }

  /**
   * Validate a signed A2A message
   */
  static validateSigned(message: unknown): { valid: boolean; errors?: string[] } {
    const result = SignedA2AMessageSchema.safeParse(message);

    if (result.success) {
      return { valid: true };
    }

    return {
      valid: false,
      errors: result.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`),
    };
  }

  // ============================================================================
  // Express/Hono Middleware
  // ============================================================================

  /**
   * Create Express middleware for handling A2A requests
   */
  static middleware(
    agentId: AgentId,
    skills: Map<string, A2ASkillDefinition>,
    privateKey: Hex
  ) {
    return async (
      req: { body: unknown; headers: Record<string, string | undefined> },
      res: { status: (code: number) => { json: (data: unknown) => void } }
    ) => {
      try {
        // Validate incoming message
        const validation = A2AProtocol.validateSigned(req.body);
        if (!validation.valid) {
          return res.status(400).json({
            error: 'Invalid message format',
            details: validation.errors,
          });
        }

        const signedMessage = req.body as SignedA2AMessage;

        // Verify signature
        const verifyResult = await A2AProtocol.verify(signedMessage);
        if (!verifyResult.valid) {
          return res.status(401).json({ error: 'Invalid signature' });
        }

        // Handle based on message type
        if (signedMessage.type === 'ping') {
          const pong = await A2AProtocol.sign(
            {
              version: 'a2a-v1',
              id: generateUUID(),
              timestamp: new Date().toISOString(),
              from: agentId,
              to: signedMessage.from,
              type: 'pong',
              replyTo: signedMessage.id,
              payload: {},
            },
            privateKey
          );
          return res.status(200).json(pong);
        }

        if (signedMessage.type !== 'request') {
          return res.status(400).json({ error: 'Expected request message' });
        }

        const request = signedMessage as A2ARequest & SignedA2AMessage;

        // Find skill handler
        const skill = skills.get(request.skill);
        if (!skill) {
          const error = await A2AProtocol.sign(
            A2AProtocol.createError({
              from: agentId,
              to: request.from,
              code: 'SKILL_NOT_FOUND',
              message: `Skill '${request.skill}' not found`,
              replyTo: request.id,
            }),
            privateKey
          );
          return res.status(404).json(error);
        }

        // Check payment if skill requires it
        if (skill.price > 0) {
          if (!request.payment || parseFloat(request.payment.maxAmount) < skill.price) {
            const response = await A2AProtocol.sign(
              A2AProtocol.createResponse({
                from: agentId,
                request,
                success: false,
                paymentRequired: {
                  amount: skill.price.toString(),
                  address: agentId.address as Address,
                  chainId: 8453, // Base
                },
              }),
              privateKey
            );
            return res.status(402).json(response);
          }
        }

        // Execute handler
        const ctx: A2AHandlerContext = {
          message: request,
          sender: request.from,
          payment: request.payment,
        };

        const result = await skill.handler(ctx);

        // Create and sign response
        const response = await A2AProtocol.sign(
          A2AProtocol.createResponse({
            from: agentId,
            request,
            success: result.success,
            data: result.data,
            error: result.error,
          }),
          privateKey
        );

        return res.status(200).json(response);
      } catch (error) {
        console.error('A2A middleware error:', error);
        return res.status(500).json({
          error: 'Internal server error',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    };
  }
}

export * from './types';
