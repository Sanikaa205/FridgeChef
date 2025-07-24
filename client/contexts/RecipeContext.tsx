import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Recipe } from '@shared/api';
import { useAuth } from './AuthContext';

interface RecipeContextType {
  recipes: Recipe[];
  likedRecipes: Recipe[];
  totalRecipes: number;
  likeRecipe: (recipeId: string, liked: boolean) => Promise<void>;
  addRecipes: (newRecipes: Recipe[]) => void;
  getRecipe: (id: string) => Recipe | undefined;
  refreshStats: () => void;
}

const RecipeContext = createContext<RecipeContextType | undefined>(undefined);

export function RecipeProvider({ children }: { children: ReactNode }) {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const { user, guestId } = useAuth();

  useEffect(() => {
    // Load recipes from localStorage on mount
    const savedRecipes = localStorage.getItem('FridgeCHef_recipes');
    if (savedRecipes) {
      try {
        const parsedRecipes = JSON.parse(savedRecipes);
        setRecipes(parsedRecipes);
      } catch (error) {
        console.error('Error parsing saved recipes:', error);
      }
    }
  }, []);

  useEffect(() => {
    // Save recipes to localStorage whenever recipes change
    localStorage.setItem('FridgeCHef_recipes', JSON.stringify(recipes));
  }, [recipes]);

  const likeRecipe = async (recipeId: string, liked: boolean) => {
    try {
      // Update local state immediately for better UX
      setRecipes(prevRecipes =>
        prevRecipes.map(recipe =>
          recipe.id === recipeId ? { ...recipe, liked } : recipe
        )
      );

      // Try to persist to backend if available
      try {
        const userId = user?.id || guestId;
        const response = await fetch('/api/recipes/like', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'user-id': userId,
          },
          body: JSON.stringify({ recipe_id: recipeId, liked }),
        });

        // If backend fails but we're in guest mode, that's okay - local storage suffices
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          console.warn('Backend like update failed:', errorData);
          // Don't revert for guest users since local storage is the source of truth
          if (user) {
            // Only revert for authenticated users where backend persistence is expected
            setRecipes(prevRecipes =>
              prevRecipes.map(recipe =>
                recipe.id === recipeId ? { ...recipe, liked: !liked } : recipe
              )
            );
            throw new Error('Failed to update recipe like status on server');
          }
        }
      } catch (apiError) {
        console.warn('API call failed, using local storage only:', apiError);
        // For guest users, local storage is sufficient
        if (user) {
          // For authenticated users, we want to show the error
          throw apiError;
        }
      }
    } catch (error) {
      console.error('Error updating recipe like status:', error);
      // Re-throw for authenticated users, suppress for guests
      if (user) {
        throw error;
      }
    }
  };

  const addRecipes = (newRecipes: Recipe[]) => {
    setRecipes(prevRecipes => {
      // Avoid duplicates by checking IDs
      const existingIds = new Set(prevRecipes.map(r => r.id));
      const uniqueNewRecipes = newRecipes.filter(r => !existingIds.has(r.id));
      return [...prevRecipes, ...uniqueNewRecipes];
    });
  };

  const getRecipe = (id: string): Recipe | undefined => {
    return recipes.find(recipe => recipe.id === id);
  };

  const refreshStats = () => {
    // This could trigger a re-fetch of stats from the API
    // For now, it's handled by computed values
  };

  const likedRecipes = recipes.filter(recipe => recipe.liked);
  const totalRecipes = recipes.length;

  const value: RecipeContextType = {
    recipes,
    likedRecipes,
    totalRecipes,
    likeRecipe,
    addRecipes,
    getRecipe,
    refreshStats
  };

  return (
    <RecipeContext.Provider value={value}>
      {children}
    </RecipeContext.Provider>
  );
}

export function useRecipes() {
  const context = useContext(RecipeContext);
  if (context === undefined) {
    throw new Error('useRecipes must be used within a RecipeProvider');
  }
  return context;
}
