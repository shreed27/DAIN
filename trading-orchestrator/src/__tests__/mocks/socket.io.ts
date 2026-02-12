/**
 * Mock for socket.io
 *
 * We're testing HTTP routes, not WebSocket functionality,
 * so we provide a minimal mock that satisfies the type requirements.
 */

import { EventEmitter } from 'events';

class MockSocket extends EventEmitter {
  id: string = 'mock-socket-id';

  join(room: string) {
    return this;
  }

  leave(room: string) {
    return this;
  }

  to(room: string) {
    return this;
  }

  disconnect(close?: boolean) {
    return this;
  }
}

export class Server extends EventEmitter {
  private sockets: Map<string, MockSocket> = new Map();

  constructor(server?: any, opts?: any) {
    super();
  }

  emit(event: string, ...args: any[]): boolean {
    // No-op for tests
    return true;
  }

  to(room: string) {
    return {
      emit: (event: string, ...args: any[]) => true,
    };
  }

  in(room: string) {
    return this.to(room);
  }

  close(callback?: () => void) {
    if (callback) callback();
  }

  attach(server: any) {
    return this;
  }

  listen(server: any) {
    return this;
  }

  on(event: string, listener: (...args: any[]) => void): this {
    return super.on(event, listener);
  }
}

export default { Server };
