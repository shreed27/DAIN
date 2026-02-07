import { Router, Request, Response } from 'express';
import * as agentOps from '../db/operations/agentNetwork';

const router = Router();

// ========== Agent Discovery ==========

// Discover available agents
router.get('/discover', (req: Request, res: Response) => {
  try {
    const { capability, minReputation, maxPrice, availability, limit } = req.query;

    const agents = agentOps.discoverAgents({
      capability: capability as string,
      minReputation: minReputation ? parseFloat(minReputation as string) : undefined,
      maxPrice: maxPrice ? parseFloat(maxPrice as string) : undefined,
      availability: availability as string,
      limit: limit ? parseInt(limit as string) : 50,
    });

    res.json({ success: true, data: agents });
  } catch (error) {
    console.error('Error discovering agents:', error);
    res.status(500).json({ success: false, error: 'Failed to discover agents' });
  }
});

// Get agent by ID
router.get('/agents/:agentId', (req: Request, res: Response) => {
  try {
    const agent = agentOps.getAgentById(req.params.agentId);

    if (!agent) {
      return res.status(404).json({ success: false, error: 'Agent not found' });
    }

    res.json({ success: true, data: agent });
  } catch (error) {
    console.error('Error fetching agent:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch agent' });
  }
});

// Register new agent
router.post('/agents', (req: Request, res: Response) => {
  try {
    const {
      agentId, name, description, ownerWallet, capabilities, endpoint,
      pricePerCall, minReputation, maxConcurrent, availability
    } = req.body;

    if (!agentId || !name || !ownerWallet || !capabilities || !endpoint) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    const agent = agentOps.registerAgent({
      agentId,
      name,
      description: description || '',
      ownerWallet,
      capabilities,
      endpoint,
      pricePerCall: pricePerCall || 0,
      minReputation: minReputation || 0,
      maxConcurrent: maxConcurrent || 10,
      availability: availability || 'online',
    });

    res.status(201).json({ success: true, data: agent });
  } catch (error) {
    console.error('Error registering agent:', error);
    res.status(500).json({ success: false, error: 'Failed to register agent' });
  }
});

// Update agent availability
router.patch('/agents/:agentId/availability', (req: Request, res: Response) => {
  try {
    const { availability } = req.body;

    if (!availability || !['online', 'busy', 'offline'].includes(availability)) {
      return res.status(400).json({ success: false, error: 'Invalid availability status' });
    }

    const agent = agentOps.updateAgentAvailability(req.params.agentId, availability);

    if (!agent) {
      return res.status(404).json({ success: false, error: 'Agent not found' });
    }

    res.json({ success: true, data: agent });
  } catch (error) {
    console.error('Error updating availability:', error);
    res.status(500).json({ success: false, error: 'Failed to update availability' });
  }
});

// Deregister agent
router.delete('/agents/:agentId', (req: Request, res: Response) => {
  try {
    const deregistered = agentOps.deregisterAgent(req.params.agentId);

    if (!deregistered) {
      return res.status(404).json({ success: false, error: 'Agent not found' });
    }

    res.json({ success: true, message: 'Agent deregistered' });
  } catch (error) {
    console.error('Error deregistering agent:', error);
    res.status(500).json({ success: false, error: 'Failed to deregister agent' });
  }
});

// ========== Subscriptions ==========

// Get subscriptions for wallet
router.get('/subscriptions', (req: Request, res: Response) => {
  try {
    const { wallet } = req.query;

    if (!wallet) {
      return res.status(400).json({ success: false, error: 'wallet is required' });
    }

    const subscriptions = agentOps.getSubscriptionsByWallet(wallet as string);
    res.json({ success: true, data: subscriptions });
  } catch (error) {
    console.error('Error fetching subscriptions:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch subscriptions' });
  }
});

// Subscribe to agent
router.post('/subscriptions', (req: Request, res: Response) => {
  try {
    const { subscriberWallet, agentId, tier, callsRemaining, pricePerCall, expiresAt } = req.body;

    if (!subscriberWallet || !agentId) {
      return res.status(400).json({ success: false, error: 'subscriberWallet and agentId are required' });
    }

    // Check if agent exists
    const agent = agentOps.getAgentById(agentId);
    if (!agent) {
      return res.status(404).json({ success: false, error: 'Agent not found' });
    }

    const subscription = agentOps.createSubscription({
      subscriberWallet,
      agentId,
      tier: tier || 'basic',
      callsRemaining: callsRemaining || 100,
      pricePerCall: pricePerCall || agent.pricePerCall,
      expiresAt: expiresAt || Date.now() + 30 * 24 * 60 * 60 * 1000, // 30 days default
      status: 'active',
    });

    res.status(201).json({ success: true, data: subscription });
  } catch (error) {
    console.error('Error creating subscription:', error);
    res.status(500).json({ success: false, error: 'Failed to create subscription' });
  }
});

// Expire old subscriptions
router.post('/subscriptions/cleanup', (req: Request, res: Response) => {
  try {
    const expired = agentOps.expireSubscriptions();
    res.json({ success: true, data: { expiredCount: expired } });
  } catch (error) {
    console.error('Error expiring subscriptions:', error);
    res.status(500).json({ success: false, error: 'Failed to expire subscriptions' });
  }
});

// ========== Jobs ==========

// Get jobs for wallet
router.get('/jobs', (req: Request, res: Response) => {
  try {
    const { wallet, agentId, status, limit } = req.query;

    if (!wallet) {
      return res.status(400).json({ success: false, error: 'wallet is required' });
    }

    const jobs = agentOps.getJobsByWallet(wallet as string, {
      agentId: agentId as string,
      status: status as string,
      limit: limit ? parseInt(limit as string) : 50,
    });

    res.json({ success: true, data: jobs });
  } catch (error) {
    console.error('Error fetching jobs:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch jobs' });
  }
});

// Get job by ID
router.get('/jobs/:jobId', (req: Request, res: Response) => {
  try {
    const job = agentOps.getJobById(req.params.jobId);

    if (!job) {
      return res.status(404).json({ success: false, error: 'Job not found' });
    }

    res.json({ success: true, data: job });
  } catch (error) {
    console.error('Error fetching job:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch job' });
  }
});

// Create job (hire agent)
router.post('/jobs', (req: Request, res: Response) => {
  try {
    const { agentId, callerWallet, capability, input } = req.body;

    if (!agentId || !callerWallet || !capability || !input) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    // Check agent availability
    const agent = agentOps.getAgentById(agentId);
    if (!agent) {
      return res.status(404).json({ success: false, error: 'Agent not found' });
    }
    if (agent.availability === 'offline') {
      return res.status(400).json({ success: false, error: 'Agent is offline' });
    }

    // Check subscription
    const subscription = agentOps.getSubscription(callerWallet, agentId);
    if (!subscription || subscription.callsRemaining <= 0) {
      return res.status(402).json({ success: false, error: 'No active subscription or calls exhausted' });
    }

    // Use a call
    agentOps.useSubscriptionCall(callerWallet, agentId, agent.pricePerCall);

    const job = agentOps.createAgentJob({
      agentId,
      callerWallet,
      capability,
      input: typeof input === 'string' ? input : JSON.stringify(input),
      cost: agent.pricePerCall,
      status: 'pending',
      startedAt: Date.now(),
    });

    res.status(201).json({ success: true, data: job });
  } catch (error) {
    console.error('Error creating job:', error);
    res.status(500).json({ success: false, error: 'Failed to create job' });
  }
});

// Complete job (agent callback)
router.post('/jobs/:jobId/complete', (req: Request, res: Response) => {
  try {
    const { output, responseTimeMs } = req.body;

    if (!output) {
      return res.status(400).json({ success: false, error: 'output is required' });
    }

    const job = agentOps.completeJob(
      req.params.jobId,
      typeof output === 'string' ? output : JSON.stringify(output),
      responseTimeMs || 0
    );

    if (!job) {
      return res.status(404).json({ success: false, error: 'Job not found' });
    }

    res.json({ success: true, data: job });
  } catch (error) {
    console.error('Error completing job:', error);
    res.status(500).json({ success: false, error: 'Failed to complete job' });
  }
});

// Fail job
router.post('/jobs/:jobId/fail', (req: Request, res: Response) => {
  try {
    const { error: jobError } = req.body;

    const job = agentOps.failJob(req.params.jobId, jobError || 'Unknown error');

    if (!job) {
      return res.status(404).json({ success: false, error: 'Job not found' });
    }

    res.json({ success: true, data: job });
  } catch (error) {
    console.error('Error failing job:', error);
    res.status(500).json({ success: false, error: 'Failed to fail job' });
  }
});

// ========== Messaging ==========

// Get messages for agent
router.get('/messages/:agentId', (req: Request, res: Response) => {
  try {
    const { unacknowledgedOnly, messageType, limit } = req.query;

    const messages = agentOps.getMessagesForAgent(req.params.agentId, {
      unacknowledgedOnly: unacknowledgedOnly === 'true',
      messageType: messageType as string,
      limit: limit ? parseInt(limit as string) : 50,
    });

    res.json({ success: true, data: messages });
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch messages' });
  }
});

// Send message
router.post('/messages', (req: Request, res: Response) => {
  try {
    const { fromAgentId, toAgentId, messageType, payload, correlationId } = req.body;

    if (!fromAgentId || !toAgentId || !messageType || !payload) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    const message = agentOps.sendAgentMessage({
      fromAgentId,
      toAgentId,
      messageType,
      payload: typeof payload === 'string' ? payload : JSON.stringify(payload),
      correlationId,
    });

    res.status(201).json({ success: true, data: message });
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({ success: false, error: 'Failed to send message' });
  }
});

// Acknowledge message
router.post('/messages/:messageId/acknowledge', (req: Request, res: Response) => {
  try {
    const acknowledged = agentOps.acknowledgeMessage(req.params.messageId);

    if (!acknowledged) {
      return res.status(404).json({ success: false, error: 'Message not found' });
    }

    res.json({ success: true, message: 'Message acknowledged' });
  } catch (error) {
    console.error('Error acknowledging message:', error);
    res.status(500).json({ success: false, error: 'Failed to acknowledge message' });
  }
});

// ========== Network Stats ==========

router.get('/stats', (req: Request, res: Response) => {
  try {
    const stats = agentOps.getNetworkStats();
    res.json({ success: true, data: stats });
  } catch (error) {
    console.error('Error fetching network stats:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch network stats' });
  }
});

export default router;
