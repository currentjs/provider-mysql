# @currentjs/provider-mysql

> *"Because your data needs a home, and MySQL is like that reliable friend who's been around since the late 90s and just works."*

A MySQL database provider that speaks fluent TypeScript and makes your generated code feel right at home with its favorite relational database. Part of the `currentjs` framework ecosystem, but perfectly capable of standing on its own two fins.

## What Is This Thing?

This is a database provider that bridges the gap between your shiny TypeScript applications and the MySQL database. Think of it as a translator who's fluent in both "modern web development" and "I've been storing data since before JavaScript was cool."

**Key Philosophy**: Named parameters are better than question marks, proper error handling beats mysterious crashes, and connection pooling is for grown-ups.

## Installation

**Using `@currentjs/gen` (Code Generator)** - *Recommended*
```bash
# No manual installation needed 
# The provider is automatically included when you generate a project with MySQL
currentjs init
# Choose MySQL in app.yaml 
```
(for more details see the [documentation](https://github.com/currentjs/gen))

**Manual Installation** - *For standalone use*
```bash
npm install @currentjs/provider-mysql
```

> 💡 **Pro Tip**: If you're using the `currentjs` code generator, this provider is automatically configured and ready to go. The generated stores use it seamlessly, so you can focus on your business logic instead of connection strings!

## Quick Start️

```typescript
import { ProviderMysql } from '@currentjs/provider-mysql';

// Configure your connection (probably from environment variables)
const provider = new ProviderMysql({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306'),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'myapp'
});

// Initialize the connection
await provider.init();

// Query with named parameters (so much cleaner!)
const users = await provider.query(
  'SELECT * FROM users WHERE status = :status AND age > :minAge',
  { status: 'active', minAge: 18 }
);

console.log(`Found ${users.data.length} active adult users`);

// Check if everything is still working
if (await provider.health()) {
  console.log('🟢 Database is happy and healthy');
} else {
  console.log('🔴 Database needs some attention');
}

// Clean shutdown when you're done
await provider.shutdown();
```

## In Generated Applications (Where It Really Shines)

When you use `@currentjs/gen` to create an application, this provider is automatically wired up in your generated stores:

```typescript
// Generated in src/modules/Blog/infrastructure/stores/PostStore.ts
import { ProviderMysql } from '@currentjs/provider-mysql';

export class PostStoreImpl implements IPostStore {
  constructor(private provider: ProviderMysql) {}

  async findById(id: number): Promise<Post | null> {
    const result = await this.provider.query(
      'SELECT * FROM posts WHERE id = :id',
      { id }
    );
    
    return result.data.length > 0 ? this.mapToEntity(result.data[0]) : null;
  }

  async create(post: CreatePostDto): Promise<Post> {
    const result = await this.provider.query(
      'INSERT INTO posts (title, content, authorId) VALUES (:title, :content, :authorId)',
      { 
        title: post.title, 
        content: post.content, 
        authorId: post.authorId 
      }
    );

    return this.findById(result.insertId!);
  }
}
```

**No configuration needed** - the generated application sets everything up automatically based on your environment variables!

## Query Results (What You Get Back)

The provider returns results in a standardized format that plays nicely with TypeScript:

```typescript
// For SELECT queries
const result = await provider.query('SELECT * FROM users WHERE role = :role', { role: 'admin' });
console.log(result.data);        // Array of user objects
console.log(result.success);     // true if query succeeded
console.log(result.fields);      // Field metadata (name, type, nullable)

// For INSERT/UPDATE/DELETE queries
const insertResult = await provider.query('UPDATE users SET status = :status WHERE id = :id', 
  { status: 'active', id: 123 });
console.log(insertResult.affectedRows); // How many rows were changed
console.log(insertResult.insertId);     // Auto-generated ID (for INSERTs)
console.log(insertResult.success);      // true if query succeeded
```

## Named Parameters (Because Life's Too Short for Question Marks)

Say goodbye to this madness:
```sql
-- MySQL2 raw style (ugh)
SELECT * FROM users WHERE status = ? AND age > ? AND city = ?
```

And hello to this clarity:
```typescript
// CurrentJS provider style (ahh, much better)
await provider.query(
  'SELECT * FROM users WHERE status = :status AND age > :minAge AND city = :city',
  { status: 'active', minAge: 25, city: 'San Francisco' }
);
```

**How it works**: The provider automatically converts `:paramName` to `?` parameters under the hood, maintaining compatibility with mysql2 while giving you readable queries.

## Error Handling (Because Things Go Wrong)

The provider includes specific error classes so you know exactly what went sideways:

```typescript
import { 
  ProviderMysql,
  MySQLConnectionError,
  MySQLQueryError,
  MySQLInitializationError
} from '@currentjs/provider-mysql';

try {
  const provider = new ProviderMysql(config);
  await provider.init();
  
  const result = await provider.query(
    'SELECT * FROM users WHERE email = :email', 
    { email: 'john@example.com' }
  );
  
} catch (error) {
  if (error instanceof MySQLConnectionError) {
    console.error('💥 Connection failed:', error.message);
    // Maybe retry connection or switch to backup database
    
  } else if (error instanceof MySQLQueryError) {
    console.error('🔍 Query failed:', error.message);
    console.error('📝 SQL was:', error.sql);
    // Log the problematic query for debugging
    
  } else if (error instanceof MySQLInitializationError) {
    console.error('⚙️ Configuration problem:', error.message);
    // Check your environment variables
  }
}
```

## Health Monitoring

The built-in health check is perfect for monitoring dashboards and load balancers:

```typescript
// Simple health check
const isHealthy = await provider.health();

// In a monitoring endpoint
app.get('/health', async (req, res) => {
  const dbHealthy = await provider.health();
  
  res.status(dbHealthy ? 200 : 503).json({
    status: dbHealthy ? 'healthy' : 'unhealthy',
    database: dbHealthy ? '🟢 connected' : '🔴 disconnected',
    timestamp: new Date().toISOString()
  });
});
```

## Configuration Options 🔧

```typescript
import { ProviderMysql } from '@currentjs/provider-mysql';

const provider = new ProviderMysql({
  host: 'localhost',              // Database host
  port: 3306,                     // Port (default: 3306)
  user: 'myuser',                 // Username
  password: 'mypassword',         // Password (keep this secret!)
  database: 'myapp',              // Database name
  
  // Advanced mysql2 options also supported:
  charset: 'utf8mb4',             // Character set
  timezone: 'local',              // Timezone handling
  connectTimeout: 60000,          // Connection timeout
  acquireTimeout: 60000,          // Acquisition timeout
  timeout: 60000,                 // Query timeout
  reconnect: true,                // Auto-reconnect
  // ... any other mysql2 ConnectionOptions
});
```

## TypeScript Support (First-Class Citizen)

Full TypeScript support with proper generic types:

```typescript
interface User {
  id: number;
  email: string;
  name: string;
  createdAt: Date;
}

// Type-safe query results
const result = await provider.query<User>(
  'SELECT id, email, name, created_at as createdAt FROM users WHERE id = :id',
  { id: 123 }
);

// result.data is User[] with full type checking
const user = result.data[0]; // TypeScript knows this is User | undefined
if (user) {
  console.log(user.email); // ✅ Type-safe property access
  console.log(user.invalid); // ❌ TypeScript error - property doesn't exist
}
```

## Part of a Bigger Picture

This provider is designed as the data layer for the `currentjs` code generation framework.

But it's also perfectly usable as a standalone MySQL client in any TypeScript application!

## Environment Variables

For generated applications, these environment variables are automatically read:

```bash
# Database connection
DB_HOST=localhost
DB_PORT=3306
DB_USER=myuser
DB_PASSWORD=supersecret
DB_NAME=myapp_production

# Optional advanced settings
DB_CHARSET=utf8mb4
DB_TIMEZONE=local
DB_CONNECTION_LIMIT=10
```

## Migration from Raw mysql2 📈

If you're currently using mysql2 directly:

**Before** (mysql2):
```typescript
import mysql from 'mysql2/promise';

const connection = await mysql.createConnection(config);
const [rows] = await connection.execute(
  'SELECT * FROM users WHERE status = ? AND age > ?',
  ['active', 18]
);
// rows is any[], no type safety
```

**After** (@currentjs/provider-mysql):
```typescript
import { ProviderMysql } from '@currentjs/provider-mysql';

const provider = new ProviderMysql(config);
await provider.init();

const result = await provider.query<User>(
  'SELECT * FROM users WHERE status = :status AND age > :minAge',
  { status: 'active', minAge: 18 }
);
// result.data is User[] with full type safety
```

**Benefits of switching:**
- ✅ Named parameters (more readable)
- ✅ Type-safe results
- ✅ Better error handling
- ✅ Built-in health checking
- ✅ Consistent result format
- ✅ No breaking changes to your SQL

## Authorship & Contribution

Vibecoded with `claude-4-sonnet` (mostly) by Konstantin Zavalny. Yes, it is a vibecoded solution, really.

Any contributions such as bugfixes, improvements, etc are very welcome.

## License

GNU Lesser General Public License (LGPL)

It simply means, that you:
- can create a proprietary application that uses this library without having to open source their entire application code (this is the "lesser" aspect of LGPL compared to GPL).
- can make any modifications, but must distribute those modifications under the LGPL (or a compatible license) and include the original copyright and license notice.
