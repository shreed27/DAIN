import { Router, Request, Response } from 'express';
import * as skillsOps from '../db/operations/skills';

const router = Router();

// ========== Skills Registry ==========

// Get all skills
router.get('/', (req: Request, res: Response) => {
  try {
    // Seed defaults if empty
    skillsOps.seedDefaultSkills();

    const { category, enabled, search, sortBy, limit } = req.query;

    const skills = skillsOps.getAllSkills({
      category: category as string,
      enabled: enabled === 'true' ? true : enabled === 'false' ? false : undefined,
      search: search as string,
      sortBy: sortBy as 'popularity' | 'successRate' | 'name',
      limit: limit ? parseInt(limit as string) : undefined,
    });

    res.json({ success: true, data: skills });
  } catch (error) {
    console.error('Error fetching skills:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch skills' });
  }
});

// Get skills by category
router.get('/by-category', (req: Request, res: Response) => {
  try {
    skillsOps.seedDefaultSkills();
    const byCategory = skillsOps.getSkillsByCategory();
    res.json({ success: true, data: byCategory });
  } catch (error) {
    console.error('Error fetching skills by category:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch skills by category' });
  }
});

// Get skill by ID
router.get('/:id', (req: Request, res: Response) => {
  try {
    const skill = skillsOps.getSkillById(req.params.id);

    if (!skill) {
      return res.status(404).json({ success: false, error: 'Skill not found' });
    }

    res.json({ success: true, data: skill });
  } catch (error) {
    console.error('Error fetching skill:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch skill' });
  }
});

// Get skill by name
router.get('/name/:name', (req: Request, res: Response) => {
  try {
    const skill = skillsOps.getSkillByName(req.params.name);

    if (!skill) {
      return res.status(404).json({ success: false, error: 'Skill not found' });
    }

    res.json({ success: true, data: skill });
  } catch (error) {
    console.error('Error fetching skill:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch skill' });
  }
});

// Register new skill
router.post('/', (req: Request, res: Response) => {
  try {
    const {
      name, displayName, description, category, subcategory, version,
      inputSchema, outputSchema, examples, costPerCall, avgExecutionTimeMs,
      requiredPermissions, enabled
    } = req.body;

    if (!name || !displayName || !description || !category) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    const skill = skillsOps.registerSkill({
      name,
      displayName,
      description,
      category,
      subcategory,
      version: version || '1.0.0',
      inputSchema: typeof inputSchema === 'string' ? inputSchema : JSON.stringify(inputSchema || {}),
      outputSchema: typeof outputSchema === 'string' ? outputSchema : JSON.stringify(outputSchema || {}),
      examples: typeof examples === 'string' ? examples : JSON.stringify(examples || []),
      costPerCall: costPerCall || 0,
      avgExecutionTimeMs: avgExecutionTimeMs || 1000,
      requiredPermissions: requiredPermissions || [],
      enabled: enabled !== false,
    });

    res.status(201).json({ success: true, data: skill });
  } catch (error) {
    console.error('Error registering skill:', error);
    res.status(500).json({ success: false, error: 'Failed to register skill' });
  }
});

// Toggle skill enabled/disabled
router.patch('/:id/toggle', (req: Request, res: Response) => {
  try {
    const { enabled } = req.body;

    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ success: false, error: 'enabled must be a boolean' });
    }

    const skill = skillsOps.toggleSkill(req.params.id, enabled);

    if (!skill) {
      return res.status(404).json({ success: false, error: 'Skill not found' });
    }

    res.json({ success: true, data: skill });
  } catch (error) {
    console.error('Error toggling skill:', error);
    res.status(500).json({ success: false, error: 'Failed to toggle skill' });
  }
});

// ========== Skill Executions ==========

// Get executions for wallet
router.get('/executions/wallet/:wallet', (req: Request, res: Response) => {
  try {
    const { skillId, status, limit } = req.query;

    const executions = skillsOps.getExecutionsByWallet(req.params.wallet, {
      skillId: skillId as string,
      status: status as string,
      limit: limit ? parseInt(limit as string) : 50,
    });

    res.json({ success: true, data: executions });
  } catch (error) {
    console.error('Error fetching executions:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch executions' });
  }
});

// Get execution by ID
router.get('/executions/:id', (req: Request, res: Response) => {
  try {
    const execution = skillsOps.getExecutionById(req.params.id);

    if (!execution) {
      return res.status(404).json({ success: false, error: 'Execution not found' });
    }

    res.json({ success: true, data: execution });
  } catch (error) {
    console.error('Error fetching execution:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch execution' });
  }
});

// Execute skill
router.post('/:id/execute', (req: Request, res: Response) => {
  try {
    const skill = skillsOps.getSkillById(req.params.id);

    if (!skill) {
      return res.status(404).json({ success: false, error: 'Skill not found' });
    }

    if (!skill.enabled) {
      return res.status(400).json({ success: false, error: 'Skill is disabled' });
    }

    const { userWallet, input } = req.body;

    if (!userWallet || !input) {
      return res.status(400).json({ success: false, error: 'userWallet and input are required' });
    }

    const execution = skillsOps.createSkillExecution({
      skillId: skill.id,
      userWallet,
      input: typeof input === 'string' ? input : JSON.stringify(input),
      cost: skill.costPerCall,
      status: 'pending',
      startedAt: Date.now(),
    });

    // In a real implementation, this would trigger the skill execution engine
    // For now, simulate completion after a delay
    setTimeout(() => {
      const mockOutput = { result: 'Skill executed successfully', input: JSON.parse(execution.input) };
      skillsOps.completeExecution(execution.id, JSON.stringify(mockOutput), skill.avgExecutionTimeMs);
    }, 100);

    res.status(201).json({ success: true, data: execution });
  } catch (error) {
    console.error('Error executing skill:', error);
    res.status(500).json({ success: false, error: 'Failed to execute skill' });
  }
});

// Complete execution (for execution engine callback)
router.post('/executions/:id/complete', (req: Request, res: Response) => {
  try {
    const { output, executionTimeMs } = req.body;

    const execution = skillsOps.completeExecution(
      req.params.id,
      typeof output === 'string' ? output : JSON.stringify(output),
      executionTimeMs || 0
    );

    if (!execution) {
      return res.status(404).json({ success: false, error: 'Execution not found' });
    }

    res.json({ success: true, data: execution });
  } catch (error) {
    console.error('Error completing execution:', error);
    res.status(500).json({ success: false, error: 'Failed to complete execution' });
  }
});

// Fail execution
router.post('/executions/:id/fail', (req: Request, res: Response) => {
  try {
    const { error: execError } = req.body;

    const execution = skillsOps.failExecution(req.params.id, execError || 'Unknown error');

    if (!execution) {
      return res.status(404).json({ success: false, error: 'Execution not found' });
    }

    res.json({ success: true, data: execution });
  } catch (error) {
    console.error('Error failing execution:', error);
    res.status(500).json({ success: false, error: 'Failed to fail execution' });
  }
});

// ========== Favorites ==========

// Get favorite skills for wallet
router.get('/favorites/:wallet', (req: Request, res: Response) => {
  try {
    const favorites = skillsOps.getFavoriteSkills(req.params.wallet);
    res.json({ success: true, data: favorites });
  } catch (error) {
    console.error('Error fetching favorites:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch favorites' });
  }
});

// Add favorite
router.post('/favorites', (req: Request, res: Response) => {
  try {
    const { userWallet, skillId } = req.body;

    if (!userWallet || !skillId) {
      return res.status(400).json({ success: false, error: 'userWallet and skillId are required' });
    }

    const favorite = skillsOps.addFavoriteSkill(userWallet, skillId);
    res.status(201).json({ success: true, data: favorite });
  } catch (error) {
    console.error('Error adding favorite:', error);
    res.status(500).json({ success: false, error: 'Failed to add favorite' });
  }
});

// Remove favorite
router.delete('/favorites/:wallet/:skillId', (req: Request, res: Response) => {
  try {
    const removed = skillsOps.removeFavoriteSkill(req.params.wallet, req.params.skillId);

    if (!removed) {
      return res.status(404).json({ success: false, error: 'Favorite not found' });
    }

    res.json({ success: true, message: 'Favorite removed' });
  } catch (error) {
    console.error('Error removing favorite:', error);
    res.status(500).json({ success: false, error: 'Failed to remove favorite' });
  }
});

// ========== Stats ==========

router.get('/stats/:wallet', (req: Request, res: Response) => {
  try {
    const stats = skillsOps.getSkillStats(req.params.wallet);
    res.json({ success: true, data: stats });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch stats' });
  }
});

// ========== Categories ==========

router.get('/categories/list', (req: Request, res: Response) => {
  res.json({
    success: true,
    data: Object.values(skillsOps.SKILL_CATEGORIES),
  });
});

export default router;
