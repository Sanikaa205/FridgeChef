import { neon } from '@neondatabase/serverless';

let sql: ReturnType<typeof neon> | null = null;

// Lazy initialization of database connection
export const getDb = () => {
  if (!sql) {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      console.warn('DATABASE_URL not set, database operations will be disabled');
      // Return a mock function for development without database
      return {
        query: () => Promise.resolve([]),
        unsafe: (str: string) => str,
      } as any;
    }
    
    try {
      sql = neon(databaseUrl);
      console.log('✅ Database connection established successfully');
    } catch (error) {
      console.error('❌ Database connection failed:', error);
      throw error;
    }
  }
  return sql;
};

// Database schema initialization
export const initializeDatabase = async () => {
  try {
    const sql = getDb();
    
    if (!process.env.DATABASE_URL) {
      console.log('⚠️  Skipping database initialization - no DATABASE_URL configured');
      return;
    }

    console.log('🔄 Initializing database schema...');
    
    // Create users table
    await sql`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        preferences JSONB DEFAULT '{}',
        theme VARCHAR(10) DEFAULT 'light',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;

    // Create recipes table
    await sql`
      CREATE TABLE IF NOT EXISTS recipes (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        ingredients JSONB NOT NULL,
        instructions JSONB NOT NULL,
        prep_time INTEGER DEFAULT 0,
        cook_time INTEGER DEFAULT 0,
        servings INTEGER DEFAULT 1,
        difficulty VARCHAR(10) DEFAULT 'easy',
        cuisine_type VARCHAR(100),
        liked BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;

    // Create indexes for better performance
    await sql`CREATE INDEX IF NOT EXISTS idx_recipes_user_id ON recipes(user_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_recipes_liked ON recipes(liked)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_recipes_created_at ON recipes(created_at)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_recipes_user_liked ON recipes(user_id, liked)`;

    console.log('✅ Database schema initialized successfully');
  } catch (error) {
    console.error('❌ Database initialization error:', error);
    // Don't throw error to allow development without database
    console.log('⚠️  Continuing without database - using local storage only');
  }
};

// Export getDb as sql for backwards compatibility
export { getDb as sql };
