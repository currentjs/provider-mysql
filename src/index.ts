import mysql, { Connection, ConnectionOptions } from 'mysql2/promise';
import { IProvider, ISqlProvider, SQLResult, SqlParam } from '@currentjs/provider';

export type { IProvider, ISqlProvider };

/**
 * MySQL connection configuration
 */
export interface MySQLConnectionConfig extends ConnectionOptions {
  host: string;
  port?: number;
  user: string;
  password: string;
  database: string;
}

/**
 * Base MySQL error class
 */
export class MySQLError extends Error {
  constructor(message: string, public readonly originalError?: any) {
    super(message);
    this.name = 'MySQLError';
  }
}

/**
 * Error thrown when connection initialization fails
 */
export class MySQLConnectionError extends MySQLError {
  constructor(message: string, originalError?: any) {
    super(message, originalError);
    this.name = 'MySQLConnectionError';
  }
}

/**
 * Error thrown when query execution fails
 */
export class MySQLQueryError extends MySQLError {
  constructor(message: string, public readonly sql?: string, originalError?: any) {
    super(message, originalError);
    this.name = 'MySQLQueryError';
  }
}

/**
 * Error thrown during provider initialization
 */
export class MySQLInitializationError extends MySQLError {
  constructor(message: string, originalError?: any) {
    super(message, originalError);
    this.name = 'MySQLInitializationError';
  }
}

/**
 * MySQL Provider class for database operations
 */
export class ProviderMysql implements ISqlProvider {
  private connection: Connection | null = null;
  private connectionConfig: MySQLConnectionConfig;
  private isConnected: boolean = false;

  /**
   * Constructor that takes a connection object
   * @param connectionConfig MySQL connection configuration
   */
  constructor(connectionConfig: MySQLConnectionConfig) {
    if (!connectionConfig) {
      throw new MySQLInitializationError('Connection configuration is required');
    }
    this.connectionConfig = connectionConfig;
  }

  /**
   * Initialize the MySQL connection
   */
  async init(): Promise<void> {
    try {
      this.connection = await mysql.createConnection(this.connectionConfig);
      this.isConnected = true;
      
      console.log('MySQL connection established successfully');
    } catch (error) {
      this.isConnected = false;
      this.connection = null;
      throw new MySQLConnectionError(`Failed to initialize MySQL connection: ${error}`, error);
    }
  }

  /**
   * Execute a SQL query with parameters
   * @param sql SQL query string
   * @param params Parameters for the query
   * @returns Promise with query results
   */
  async query<TData = any>(sql: string, params: Record<string, SqlParam> = {}): Promise<SQLResult<TData>> {
    if (!this.connection) {
      throw new MySQLConnectionError('Database connection not initialized. Call init() first.');
    }

    try {
      // Convert named parameters to positional parameters
      let processedSql = sql;
      const paramValues: SqlParam[] = [];
      
      // Replace named parameters (:paramName) with positional parameters (?)
      processedSql = sql.replace(/:(\w+)/g, (match, paramName) => {
        if (params.hasOwnProperty(paramName)) {
          paramValues.push(params[paramName]);
          return '?';
        }
        throw new MySQLQueryError(`Parameter '${paramName}' not found in params object`, sql);
      });

      console.log('Going to execute query', processedSql, paramValues);
      const [rows, fields] = await this.connection.execute(processedSql, paramValues);
      
      // Handle different types of query results
      if (Array.isArray(rows)) {
        // For SELECT operations
        return {
          data: rows as TData[],
          success: true,
          fields: fields ? fields.map((field: any) => ({
            name: field.name || '',
            type: field.type || 'unknown',
            nullable: field.flags ? !(field.flags & 1) : true // Check NOT_NULL flag
          })) : undefined
        };
      } else {
        // For INSERT, UPDATE, DELETE operations
        const resultSetHeader = rows as any;
        return {
          data: [],
          success: true,
          affectedRows: resultSetHeader.affectedRows,
          insertId: resultSetHeader.insertId,
          changedRows: resultSetHeader.changedRows,
          fields: fields ? fields.map((field: any) => ({
            name: field.name || '',
            type: field.type || 'unknown',
            nullable: field.flags ? !(field.flags & 1) : true
          })) : undefined
        };
      }
    } catch (error) {
      console.log(error, sql, params);
      if (error instanceof MySQLQueryError) {
        throw error;
      }
      throw new MySQLQueryError(`Query execution failed: ${error}`, sql, error);
    }
  }

  /**
   * Check the health of the database connection by executing a simple query
   * @returns true if connection is healthy, false otherwise
   */
  async health(): Promise<boolean> {
    if (!this.isConnected || !this.connection) {
      return false;
    }

    try {
      // Execute a simple query to test the connection
      await this.connection.execute('SELECT 1');
      return true;
    } catch (error) {
      // Connection is not healthy if query fails
      this.isConnected = false;
      return false;
    }
  }

  /**
   * Close the database connection
   */
  async shutdown(): Promise<void> {
    if (this.connection) {
      try {
        await this.connection.end();
        this.connection = null;
        this.isConnected = false;
        console.log('MySQL connection closed successfully');
      } catch (error) {
        console.error('Error closing MySQL connection:', error);
        throw new MySQLConnectionError(`Failed to shutdown MySQL connection: ${error}`, error);
      }
    }
  }
}
