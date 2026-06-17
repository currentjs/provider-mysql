// Type declaration for Node.js require
declare const require: any;

// Mock mysql2/promise - define mocks first
interface MockFunction<T = any> {
  calls: any[][];
  results: T[];
  mockReturnValue(value: T): void;
  mockResolvedValue(value: T): void;
  mockRejectedValue(value: any): void;
  mockReset(): void;
  (...args: any[]): T;
}

function createMockFunction<T = any>(): MockFunction<T> {
  const fn = (...args: any[]): T => {
    (fn as any).calls.push(args);
    if ((fn as any).results.length > 0) {
      const result = (fn as any).results.shift();
      if (result && typeof result === 'object' && result._isPromise) {
        if (result._isRejected) {
          return Promise.reject(result._value) as any;
        }
        return Promise.resolve(result._value) as any;
      }
      return result;
    }
    return undefined as any;
  };
  
  (fn as any).calls = [] as any[][];
  (fn as any).results = [] as T[];
  
  (fn as any).mockReturnValue = (value: T) => {
    (fn as any).results.push(value);
  };
  
  (fn as any).mockResolvedValue = (value: T) => {
    (fn as any).results.push({ _isPromise: true, _isRejected: false, _value: value } as any);
  };
  
  (fn as any).mockRejectedValue = (value: any) => {
    (fn as any).results.push({ _isPromise: true, _isRejected: true, _value: value } as any);
  };
  
  (fn as any).mockReset = () => {
    (fn as any).calls = [];
    (fn as any).results = [];
  };
  
  return fn as MockFunction<T>;
}

const mockConnection = {
  execute: createMockFunction(),
  end: createMockFunction()
};

const mockMysql = {
  createConnection: createMockFunction()
};

// Setup mock BEFORE importing the provider to intercept mysql2/promise require
const Module = require('module');
const originalRequire = Module.prototype.require;

Module.prototype.require = function(id: string) {
  if (id === 'mysql2/promise') {
    return mockMysql;
  }
  return originalRequire.apply(this, arguments);
};

import { describe, it, expect, beforeEach, afterEach } from '../lib.js';
import { 
  ProviderMysql, 
  MySQLConnectionConfig, 
  MySQLError,
  MySQLConnectionError,
  MySQLQueryError,
  MySQLInitializationError
} from '../../src/index.js';

// Store original console methods to restore later
const originalConsole = {
  log: console.log,
  error: console.error
};

const restoreConsole = () => {
  console.log = originalConsole.log;
  console.error = originalConsole.error;
};

const cleanupMysqlMock = () => {
  (mockConnection.execute as any).mockReset();
  (mockConnection.end as any).mockReset();
  (mockMysql.createConnection as any).mockReset();
};

// Helper functions for assertions
const expectToHaveBeenCalledWith = (mockFn: MockFunction, ...expectedArgs: any[]) => {
  const calls = (mockFn as any).calls;
  const found = calls.some((call: any[]) => {
    if (call.length !== expectedArgs.length) return false;
    return call.every((arg, index) => {
      const expected = expectedArgs[index];
      if (typeof expected === 'object' && expected !== null) {
        return JSON.stringify(arg) === JSON.stringify(expected);
      }
      return arg === expected;
    });
  });
  
  if (!found) {
    throw new Error(`Expected function to have been called with ${JSON.stringify(expectedArgs)}, but it was called with: ${JSON.stringify(calls)}`);
  }
};

const expectToHaveBeenCalled = (mockFn: MockFunction) => {
  const calls = (mockFn as any).calls;
  if (calls.length === 0) {
    throw new Error('Expected function to have been called, but it was not called');
  }
};

const expectNotToHaveBeenCalled = (mockFn: MockFunction) => {
  const calls = (mockFn as any).calls;
  if (calls.length > 0) {
    throw new Error(`Expected function not to have been called, but it was called ${calls.length} times`);
  }
};

// Mock console calls tracking
let consoleLogCalls: any[][] = [];
let consoleErrorCalls: any[][] = [];

const mockConsole = () => {
  consoleLogCalls = [];
  consoleErrorCalls = [];
  console.log = (...args: any[]) => { consoleLogCalls.push(args); };
  console.error = (...args: any[]) => { consoleErrorCalls.push(args); };
};

describe('ProviderMysql', () => {
  let validConfig: MySQLConnectionConfig = {
    host: 'localhost',
    port: 3306,
    user: 'testuser',
    password: 'testpass',
    database: 'testdb'
  };
  let provider: ProviderMysql;

  beforeEach(() => {
    mockConsole();

    // Reset mocks
    (mockConnection.execute as any).mockReset();
    (mockConnection.end as any).mockReset();
    (mockMysql.createConnection as any).mockReset();
  });

  afterEach(() => {
    cleanupMysqlMock();
    restoreConsole();
  });

  describe('Constructor', () => {
    it('should create provider with valid configuration', () => {
      provider = new ProviderMysql(validConfig);
      expect(provider).toBeDefined();
    });

    it('should throw MySQLInitializationError with null configuration', () => {
      let error: any;
      try {
        provider = new ProviderMysql(null as any);
      } catch (e) {
        error = e;
      }
      
      expect(error).toBeDefined();
      expect(error.name).toBe('MySQLInitializationError');
      expect(error.message).toContain('Connection configuration is required');
    });

    it('should throw MySQLInitializationError with undefined configuration', () => {
      let error: any;
      try {
        provider = new ProviderMysql(undefined as any);
      } catch (e) {
        error = e;
      }
      
      expect(error).toBeDefined();
      expect(error.name).toBe('MySQLInitializationError');
    });
  });

  describe('Error Classes', () => {
    it('should create MySQLError with message and originalError', () => {
      const originalError = new Error('Original error');
      const error = new MySQLError('Test error', originalError);
      
      expect(error.name).toBe('MySQLError');
      expect(error.message).toBe('Test error');
      expect(error.originalError).toBe(originalError);
    });

    it('should create MySQLConnectionError', () => {
      const error = new MySQLConnectionError('Connection failed');
      
      expect(error.name).toBe('MySQLConnectionError');
      expect(error.message).toBe('Connection failed');
      expect(error instanceof MySQLError).toBeTruthy();
    });

    it('should create MySQLQueryError with SQL', () => {
      const sql = 'SELECT * FROM users';
      const error = new MySQLQueryError('Query failed', sql);
      
      expect(error.name).toBe('MySQLQueryError');
      expect(error.message).toBe('Query failed');
      expect(error.sql).toBe(sql);
      expect(error instanceof MySQLError).toBeTruthy();
    });

    it('should create MySQLInitializationError', () => {
      const error = new MySQLInitializationError('Init failed');
      
      expect(error.name).toBe('MySQLInitializationError');
      expect(error.message).toBe('Init failed');
      expect(error instanceof MySQLError).toBeTruthy();
    });
  });

  describe('init()', () => {
    beforeEach(() => {
      provider = new ProviderMysql(validConfig);
    });

    it('should initialize connection successfully', async () => {
      (mockMysql.createConnection as any).mockResolvedValue(mockConnection);
      
      await provider.init();
      
      expectToHaveBeenCalledWith(mockMysql.createConnection, validConfig);
    });

    it('should throw MySQLConnectionError on connection failure', async () => {
      const connectionError = new Error('Connection refused');
      (mockMysql.createConnection as any).mockRejectedValue(connectionError);
      
      let error: any;
      try {
        await provider.init();
      } catch (e) {
        error = e;
      }
      
      expect(error).toBeDefined();
      expect(error.name).toBe('MySQLConnectionError');
      expect(error.message).toContain('Failed to initialize MySQL connection');
      expect(error.originalError).toBe(connectionError);
    });
  });

  describe('query()', () => {
    beforeEach(async () => {
      provider = new ProviderMysql(validConfig);
      (mockMysql.createConnection as any).mockResolvedValue(mockConnection);
      await provider.init();
    });

    it('should throw error when connection not initialized', async () => {
      const uninitializedProvider = new ProviderMysql(validConfig);
      
      let error: any;
      try {
        await uninitializedProvider.query('SELECT 1');
      } catch (e) {
        error = e;
      }
      
      expect(error).toBeDefined();
      expect(error.name).toBe('MySQLConnectionError');
      expect(error.message).toContain('Database connection not initialized');
    });

    it('should execute SELECT query successfully', async () => {
      const mockRows = [{ id: 1, name: 'test' }];
      const mockFields = [
        { name: 'id', type: 'number', flags: 1 },
        { name: 'name', type: 'string', flags: 0 }
      ];
      
      (mockConnection.execute as any).mockResolvedValue([mockRows, mockFields]);
      
      const result = await provider.query('SELECT * FROM users WHERE id = :id', { id: 1 });
      
      expectToHaveBeenCalledWith(mockConnection.execute, 'SELECT * FROM users WHERE id = ?', [1]);
      expect(result.success).toBeTruthy();
      expect(result.data).toEqual(mockRows);
      expect(result.fields).toBeDefined();
      expect(result.fields![0].name).toBe('id');
      expect(result.fields![0].nullable).toBeFalsy(); // flags & 1 = NOT_NULL
      expect(result.fields![1].nullable).toBeTruthy(); // !(flags & 1) = nullable
    });

    it('should execute INSERT query successfully', async () => {
      const mockResultHeader = {
        affectedRows: 1,
        insertId: 123,
        changedRows: 1
      };
      
      (mockConnection.execute as any).mockResolvedValue([mockResultHeader, undefined]);
      
      const result = await provider.query(
        'INSERT INTO users (name, email) VALUES (:name, :email)',
        { name: 'John', email: 'john@example.com' }
      );
      
      expectToHaveBeenCalledWith(
        mockConnection.execute,
        'INSERT INTO users (name, email) VALUES (?, ?)',
        ['John', 'john@example.com']
      );
      expect(result.success).toBeTruthy();
      expect(result.data).toEqual([]);
      expect(result.affectedRows).toBe(1);
      expect(result.insertId).toBe(123);
      expect(result.changedRows).toBe(1);
    });

    it('should handle queries without parameters', async () => {
      const mockRows = [{ count: 5 }];
      (mockConnection.execute as any).mockResolvedValue([mockRows, undefined]);
      
      const result = await provider.query('SELECT COUNT(*) as count FROM users');
      
      expectToHaveBeenCalledWith(mockConnection.execute, 'SELECT COUNT(*) as count FROM users', []);
      expect(result.success).toBeTruthy();
      expect(result.data).toEqual(mockRows);
    });

    it('should throw error for missing parameter', async () => {
      let error: any;
      try {
        await provider.query('SELECT * FROM users WHERE id = :id AND name = :name', { id: 1 });
      } catch (e) {
        error = e;
      }
      
      expect(error).toBeDefined();
      expect(error.name).toBe('MySQLQueryError');
      expect(error.message).toContain("Parameter 'name' not found in params object");
      expect(error.sql).toContain('SELECT * FROM users WHERE id = :id AND name = :name');
    });

    it('should handle query execution errors', async () => {
      const sqlError = new Error('Syntax error');
      (mockConnection.execute as any).mockRejectedValue(sqlError);
      
      let error: any;
      try {
        await provider.query('INVALID SQL', {});
      } catch (e) {
        error = e;
      }
      
      expect(error).toBeDefined();
      expect(error.name).toBe('MySQLQueryError');
      expect(error.message).toContain('Query execution failed');
      expect(error.originalError).toBe(sqlError);
      expect(error.sql).toBe('INVALID SQL');
    });

    it('should re-throw MySQLQueryError without wrapping', async () => {
      const originalError = new MySQLQueryError('Original query error', 'SELECT 1');
      (mockConnection.execute as any).mockRejectedValue(originalError);
      
      let error: any;
      try {
        await provider.query('SELECT 1');
      } catch (e) {
        error = e;
      }
      
      expect(error).toBe(originalError);
      expect(error.name).toBe('MySQLQueryError');
      expect(error.message).toBe('Original query error');
    });

    it('should handle complex parameter substitution', async () => {
      (mockConnection.execute as any).mockResolvedValue([[], undefined]);
      
      await provider.query(
        'UPDATE users SET name = :name, updated_at = :timestamp WHERE id = :id AND status = :status',
        { 
          name: 'John Doe', 
          timestamp: new Date('2023-01-01'), 
          id: 123, 
          status: 'active' 
        }
      );
      
      expectToHaveBeenCalledWith(
        mockConnection.execute,
        'UPDATE users SET name = ?, updated_at = ? WHERE id = ? AND status = ?',
        ['John Doe', new Date('2023-01-01'), 123, 'active']
      );
    });
  });

  describe('health()', () => {
    beforeEach(() => {
      provider = new ProviderMysql(validConfig);
    });

    it('should return false when connection not initialized', async () => {
      const health = await provider.health();
      expect(health).toBeFalsy();
    });

    it('should return true when connection is healthy', async () => {
      (mockMysql.createConnection as any).mockResolvedValue(mockConnection);
      (mockConnection.execute as any).mockResolvedValue([[], undefined]);
      
      await provider.init();
      const health = await provider.health();
      
      expect(health).toBeTruthy();
      expectToHaveBeenCalledWith(mockConnection.execute, 'SELECT 1');
    });

    it('should return false and update connection state when health check fails', async () => {
      (mockMysql.createConnection as any).mockResolvedValue(mockConnection);
      await provider.init();
      
      // Simulate health check failure
      (mockConnection.execute as any).mockRejectedValue(new Error('Connection lost'));
      
      const health = await provider.health();
      
      expect(health).toBeFalsy();
      expectToHaveBeenCalledWith(mockConnection.execute, 'SELECT 1');
    });
  });

  describe('shutdown()', () => {
    beforeEach(() => {
      provider = new ProviderMysql(validConfig);
    });

    it('should do nothing when connection not established', async () => {
      await provider.shutdown();
      expectNotToHaveBeenCalled(mockConnection.end);
    });

    it('should close connection successfully', async () => {
      (mockMysql.createConnection as any).mockResolvedValue(mockConnection);
      (mockConnection.end as any).mockResolvedValue(undefined);
      
      await provider.init();
      await provider.shutdown();
      
      expectToHaveBeenCalled(mockConnection.end);
    });

    it('should throw MySQLConnectionError on shutdown failure', async () => {
      (mockMysql.createConnection as any).mockResolvedValue(mockConnection);
      const shutdownError = new Error('Connection close failed');
      (mockConnection.end as any).mockRejectedValue(shutdownError);
      
      await provider.init();
      
      let error: any;
      try {
        await provider.shutdown();
      } catch (e) {
        error = e;
      }
      
      expect(error).toBeDefined();
      expect(error.name).toBe('MySQLConnectionError');
      expect(error.message).toContain('Failed to shutdown MySQL connection');
      expect(error.originalError).toBe(shutdownError);
    });
  });
});
