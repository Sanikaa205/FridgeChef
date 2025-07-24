import express from "express";
import cors from "cors";
import { initializeDatabase } from "./database";
import { healthCheck, readinessCheck } from "./routes/health";
import { 
  generateRecipes, 
  getDashboardData, 
  getRecipeHistory, 
  likeRecipe, 
  getRecipe 
} from "./routes/recipes";

export function createServer() {
  const app = express();

  // Middleware
  app.use(cors({
    origin: process.env.NODE_ENV === 'production' 
      ? ['https://*.netlify.app', 'https://*.netlify.com']
      : true,
    credentials: true
  }));
  
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Health endpoints
  app.get("/api/health", healthCheck);
  app.get("/api/ready", readinessCheck);

  // API endpoints
  app.get("/api/ping", (req, res) => {
    res.json({ 
      message: "FridgeCHef API is running!",
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development'
    });
  });

  // Recipe routes
  app.post("/api/recipes/generate", generateRecipes);
  app.get("/api/dashboard", getDashboardData);
  app.get("/api/recipes/history", getRecipeHistory);
  app.post("/api/recipes/like", likeRecipe);
  app.get("/api/recipes/:id", getRecipe);

  // Error handling middleware
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('Server error:', err);
    
    if (res.headersSent) {
      return next(err);
    }
    
    res.status(500).json({
      success: false,
      message: process.env.NODE_ENV === 'production' 
        ? 'Internal server error' 
        : err.message,
      timestamp: new Date().toISOString()
    });
  });

  // 404 handler
  app.use((req, res) => {
    res.status(404).json({
      success: false,
      message: 'API endpoint not found',
      path: req.path,
      timestamp: new Date().toISOString()
    });
  });

  // Initialize database on startup (async, non-blocking)
  setImmediate(() => {
    initializeDatabase().catch(err => {
      console.warn('Database initialization failed, continuing without database:', err.message);
    });
  });

  return app;
}
