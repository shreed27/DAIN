/**
 * IdentityRegistry Contract ABI
 * Based on ERC-8004 (draft) for ClawdNet agents
 */

export const IDENTITY_REGISTRY_ABI = [
  // Events
  {
    type: 'event',
    name: 'AgentRegistered',
    inputs: [
      { name: 'agentId', type: 'uint256', indexed: true },
      { name: 'agentDomain', type: 'string', indexed: true },
      { name: 'agentAddress', type: 'address', indexed: true },
    ],
  },
  {
    type: 'event',
    name: 'AgentUpdated',
    inputs: [
      { name: 'agentId', type: 'uint256', indexed: true },
      { name: 'previousAgentDomain', type: 'string', indexed: false },
      { name: 'newAgentDomain', type: 'string', indexed: true },
      { name: 'previousAgentAddress', type: 'address', indexed: false },
      { name: 'newAgentAddress', type: 'address', indexed: true },
    ],
  },
  // Errors
  {
    type: 'error',
    name: 'Unauthorized',
    inputs: [
      { name: 'caller', type: 'address' },
      { name: 'expected', type: 'address' },
    ],
  },
  { type: 'error', name: 'InvalidDomain', inputs: [] },
  { type: 'error', name: 'InvalidAddress', inputs: [] },
  {
    type: 'error',
    name: 'DomainAlreadyRegistered',
    inputs: [{ name: 'domain', type: 'string' }],
  },
  {
    type: 'error',
    name: 'AddressAlreadyRegistered',
    inputs: [{ name: 'agentAddress', type: 'address' }],
  },
  {
    type: 'error',
    name: 'AgentNotFound',
    inputs: [{ name: 'agentId', type: 'uint256' }],
  },
  // Read functions
  {
    type: 'function',
    name: 'getAgent',
    stateMutability: 'view',
    inputs: [{ name: 'agentId', type: 'uint256' }],
    outputs: [
      { name: 'agentId_', type: 'uint256' },
      { name: 'agentDomain_', type: 'string' },
      { name: 'agentAddress_', type: 'address' },
    ],
  },
  {
    type: 'function',
    name: 'resolveAgentByDomain',
    stateMutability: 'view',
    inputs: [{ name: 'agentDomain', type: 'string' }],
    outputs: [
      { name: 'agentId_', type: 'uint256' },
      { name: 'agentDomain_', type: 'string' },
      { name: 'agentAddress_', type: 'address' },
    ],
  },
  {
    type: 'function',
    name: 'resolveAgentByAddress',
    stateMutability: 'view',
    inputs: [{ name: 'agentAddress', type: 'address' }],
    outputs: [
      { name: 'agentId_', type: 'uint256' },
      { name: 'agentDomain_', type: 'string' },
      { name: 'agentAddress_', type: 'address' },
    ],
  },
  {
    type: 'function',
    name: 'totalAgents',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  // Write functions
  {
    type: 'function',
    name: 'newAgent',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'agentDomain', type: 'string' },
      { name: 'agentAddress', type: 'address' },
    ],
    outputs: [{ name: 'agentId', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'updateAgent',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'agentId', type: 'uint256' },
      { name: 'newAgentDomain', type: 'string' },
      { name: 'newAgentAddress', type: 'address' },
    ],
    outputs: [{ name: 'success', type: 'bool' }],
  },
] as const;

export type IdentityRegistryAbi = typeof IDENTITY_REGISTRY_ABI;
