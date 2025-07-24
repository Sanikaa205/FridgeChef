import { RequestHandler } from 'express';
import { sql } from '../database';
import { openAIService } from '../services/openai';
import { 
  GenerateRecipeRequest, 
  GenerateRecipeResponse, 
  DashboardData, 
  RecipeHistoryRequest,
  RecipeHistoryResponse,
  LikeRecipeRequest,
  LikeRecipeResponse,
  Recipe 
} from '@shared/api';

// Generate recipes using OpenAI
export const generateRecipes: RequestHandler = async (req, res) => {
  try {
    const { ingredients, preferences, allow_additional_ingredients }: GenerateRecipeRequest = req.body;
    
    // Support both authenticated users and guests
    const userId = req.headers['user-id'] as string || `guest-${Date.now()}`;
    
    if (!ingredients || ingredients.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Please provide at least one ingredient'
      });
    }

    const recipes = await openAIService.generateRecipes({
      ingredients,
      preferences,
      allow_additional_ingredients
    }, userId);

    // Save recipes to database (skip if no database connection)
    try {
      const db = sql();
      if (process.env.DATABASE_URL) {
        for (const recipe of recipes) {
          await db`
            INSERT INTO recipes (
              id, user_id, title, description, ingredients, instructions,
              prep_time, cook_time, servings, difficulty, cuisine_type, liked, created_at
            ) VALUES (
              ${recipe.id}, ${recipe.user_id}, ${recipe.title}, ${recipe.description},
              ${JSON.stringify(recipe.ingredients)}, ${JSON.stringify(recipe.instructions)},
              ${recipe.prep_time}, ${recipe.cook_time}, ${recipe.servings},
              ${recipe.difficulty}, ${recipe.cuisine_type}, ${recipe.liked}, ${recipe.created_at}
            )
          `;
        }
      }
    } catch (dbError) {
      console.warn('Database save failed, continuing without persistence:', dbError);
    }

    const response: GenerateRecipeResponse = {
      recipes,
      success: true
    };

    res.json(response);
  } catch (error) {
    console.error('Error generating recipes:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate recipes. Please try again.'
    });
  }
};

// Get dashboard data
export const getDashboardData: RequestHandler = async (req, res) => {
  try {
    const userId = req.headers['user-id'] as string || `guest-${Date.now()}`;

    // Return empty dashboard data if no database connection
    if (!process.env.DATABASE_URL) {
      const dashboardData: DashboardData = {
        trending_recipe: null,
        top_liked_recipes: [],
        total_recipes: 0,
        total_liked: 0
      };
      return res.json(dashboardData);
    }

    try {
      const db = sql();

      // Get random trending recipe from liked recipes
      const trendingRecipeResult = await db`
        SELECT * FROM recipes 
        WHERE user_id = ${userId} AND liked = true 
        ORDER BY RANDOM() 
        LIMIT 1
      `;

      // Get top 5 liked recipes
      const topLikedResult = await db`
        SELECT * FROM recipes 
        WHERE user_id = ${userId} AND liked = true 
        ORDER BY created_at DESC 
        LIMIT 5
      `;

      // Get total counts
      const totalRecipesResult = await db`
        SELECT COUNT(*) as count FROM recipes WHERE user_id = ${userId}
      `;

      const totalLikedResult = await db`
        SELECT COUNT(*) as count FROM recipes WHERE user_id = ${userId} AND liked = true
      `;

      const dashboardData: DashboardData = {
        trending_recipe: trendingRecipeResult[0] ? parseRecipeFromDb(trendingRecipeResult[0]) : null,
        top_liked_recipes: topLikedResult.map(parseRecipeFromDb),
        total_recipes: parseInt(totalRecipesResult[0].count),
        total_liked: parseInt(totalLikedResult[0].count)
      };

      res.json(dashboardData);
    } catch (dbError) {
      console.warn('Database query failed:', dbError);
      // Return empty data on database error
      const dashboardData: DashboardData = {
        trending_recipe: null,
        top_liked_recipes: [],
        total_recipes: 0,
        total_liked: 0
      };
      res.json(dashboardData);
    }
  } catch (error) {
    console.error('Error fetching dashboard data:', error);
    res.status(500).json({
      message: 'Failed to fetch dashboard data'
    });
  }
};

// Get recipe history with filters and pagination
export const getRecipeHistory: RequestHandler = async (req, res) => {
  try {
    const userId = req.headers['user-id'] as string || `guest-${Date.now()}`;
    const { 
      filter = 'all', 
      sort_by = 'created_at', 
      sort_order = 'desc',
      page = 1,
      limit = 10 
    }: RecipeHistoryRequest = req.query;

    // Return empty result if no database connection
    if (!process.env.DATABASE_URL) {
      const response: RecipeHistoryResponse = {
        recipes: [],
        total: 0,
        page: Number(page),
        limit: Number(limit),
        has_more: false
      };
      return res.json(response);
    }

    try {
      const db = sql();
      const offset = (Number(page) - 1) * Number(limit);

      // Build queries using neon's tagged template syntax
      let baseQuery = db`SELECT * FROM recipes WHERE user_id = ${userId}`;
      let countQuery = db`SELECT COUNT(*) as count FROM recipes WHERE user_id = ${userId}`;

      // Apply filter
      if (filter === 'liked') {
        baseQuery = db`SELECT * FROM recipes WHERE user_id = ${userId} AND liked = true`;
        countQuery = db`SELECT COUNT(*) as count FROM recipes WHERE user_id = ${userId} AND liked = true`;
      } else if (filter === 'disliked') {
        baseQuery = db`SELECT * FROM recipes WHERE user_id = ${userId} AND liked = false`;
        countQuery = db`SELECT COUNT(*) as count FROM recipes WHERE user_id = ${userId} AND liked = false`;
      }

      // Get recipes with sorting and pagination
      const validSortFields = ['created_at', 'title', 'cook_time'];
      const sortField = validSortFields.includes(sort_by) ? sort_by : 'created_at';
      const sortDirection = sort_order === 'asc' ? 'ASC' : 'DESC';

      let recipes;
      if (filter === 'liked') {
        recipes = await db`
          SELECT * FROM recipes 
          WHERE user_id = ${userId} AND liked = true
          ORDER BY ${db.unsafe(sortField)} ${db.unsafe(sortDirection)}
          LIMIT ${Number(limit)} OFFSET ${offset}
        `;
      } else if (filter === 'disliked') {
        recipes = await db`
          SELECT * FROM recipes 
          WHERE user_id = ${userId} AND liked = false
          ORDER BY ${db.unsafe(sortField)} ${db.unsafe(sortDirection)}
          LIMIT ${Number(limit)} OFFSET ${offset}
        `;
      } else {
        recipes = await db`
          SELECT * FROM recipes 
          WHERE user_id = ${userId}
          ORDER BY ${db.unsafe(sortField)} ${db.unsafe(sortDirection)}
          LIMIT ${Number(limit)} OFFSET ${offset}
        `;
      }

      const totalResult = await countQuery;
      const total = parseInt(totalResult[0]?.count || '0');
      const hasMore = offset + Number(limit) < total;

      const response: RecipeHistoryResponse = {
        recipes: recipes.map(parseRecipeFromDb),
        total,
        page: Number(page),
        limit: Number(limit),
        has_more: hasMore
      };

      res.json(response);
    } catch (dbError) {
      console.warn('Database query failed:', dbError);
      // Return empty result on database error
      const response: RecipeHistoryResponse = {
        recipes: [],
        total: 0,
        page: Number(page),
        limit: Number(limit),
        has_more: false
      };
      res.json(response);
    }
  } catch (error) {
    console.error('Error fetching recipe history:', error);
    res.status(500).json({
      message: 'Failed to fetch recipe history'
    });
  }
};

// Like/unlike a recipe
export const likeRecipe: RequestHandler = async (req, res) => {
  try {
    const { recipe_id, liked }: LikeRecipeRequest = req.body;
    const userId = req.headers['user-id'] as string || `guest-${Date.now()}`;

    // If no database connection, return success (local storage will handle it)
    if (!process.env.DATABASE_URL) {
      return res.json({
        success: true,
        message: 'Like status updated locally'
      });
    }

    try {
      const db = sql();

      const result = await db`
        UPDATE recipes 
        SET liked = ${liked}
        WHERE id = ${recipe_id} AND user_id = ${userId}
        RETURNING *
      `;

      if (result.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Recipe not found'
        });
      }

      const response: LikeRecipeResponse = {
        success: true,
        recipe: parseRecipeFromDb(result[0])
      };

      res.json(response);
    } catch (dbError) {
      console.warn('Database update failed:', dbError);
      // Return success anyway for guest mode compatibility
      res.json({
        success: true,
        message: 'Like status updated locally'
      });
    }
  } catch (error) {
    console.error('Error updating recipe like status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update recipe'
    });
  }
};

// Get single recipe
export const getRecipe: RequestHandler = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.headers['user-id'] as string || `guest-${Date.now()}`;

    if (!process.env.DATABASE_URL) {
      return res.status(503).json({
        message: 'Database not available'
      });
    }

    try {
      const db = sql();

      const result = await db`
        SELECT * FROM recipes 
        WHERE id = ${id} AND user_id = ${userId}
      `;

      if (result.length === 0) {
        return res.status(404).json({
          message: 'Recipe not found'
        });
      }

      res.json(parseRecipeFromDb(result[0]));
    } catch (dbError) {
      console.warn('Database query failed:', dbError);
      res.status(503).json({
        message: 'Database operation failed'
      });
    }
  } catch (error) {
    console.error('Error fetching recipe:', error);
    res.status(500).json({
      message: 'Failed to fetch recipe'
    });
  }
};

// Helper function to parse database result to Recipe type
function parseRecipeFromDb(dbRow: any): Recipe {
  return {
    id: dbRow.id,
    user_id: dbRow.user_id,
    title: dbRow.title,
    description: dbRow.description,
    ingredients: JSON.parse(dbRow.ingredients),
    instructions: JSON.parse(dbRow.instructions),
    prep_time: dbRow.prep_time,
    cook_time: dbRow.cook_time,
    servings: dbRow.servings,
    difficulty: dbRow.difficulty,
    cuisine_type: dbRow.cuisine_type,
    liked: dbRow.liked,
    created_at: dbRow.created_at
  };
}
