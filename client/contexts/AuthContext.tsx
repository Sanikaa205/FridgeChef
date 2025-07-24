import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface User {
  id: string;
  name: string;
  email: string;
  theme: 'light' | 'dark';
}

interface AuthContextType {
  user: User | null;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => void;
  updateUser: (updates: Partial<User>) => void;
  isAuthenticated: boolean;
  isGuest: boolean;
  loading: boolean;
  guestId: string;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [guestId, setGuestId] = useState<string>('');

  useEffect(() => {
    // Clear any existing demo user data on app start
    const savedUser = localStorage.getItem('FridgeChef_user');
    if (savedUser) {
      try {
        const userData = JSON.parse(savedUser);
        // Only keep non-demo users
        if (userData.id !== 'demo-user') {
          setUser(userData);
          
          // Apply theme
          if (userData.theme === 'dark') {
            document.documentElement.classList.add('dark');
          }
        } else {
          // Remove demo user
          localStorage.removeItem('FridgeChef_user');
        }
      } catch (error) {
        console.error('Error parsing saved user data:', error);
        localStorage.removeItem('FridgeChef_user');
      }
    }
    
    // Generate or get guest ID for anonymous users
    let guestUserId = localStorage.getItem('FridgeChef_guest_id');
    if (!guestUserId) {
      guestUserId = `guest-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      localStorage.setItem('FridgeChef_guest_id', guestUserId);
    }
    setGuestId(guestUserId);
    
    setLoading(false);
  }, []);

  const login = async (email: string, password: string): Promise<boolean> => {
    setLoading(true);
    
    try {
      // In a real app, this would make an API call
      const user: User = {
        id: `user-${Date.now()}`,
        name: email.split('@')[0],
        email,
        theme: 'light'
      };
      
      setUser(user);
      localStorage.setItem('FridgeChef_user', JSON.stringify(user));
      return true;
    } catch (error) {
      console.error('Login error:', error);
      return false;
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('FridgeChef_user');
    // Keep guest ID but clear user data
    // Reset theme to light
    document.documentElement.classList.remove('dark');
  };

  const updateUser = (updates: Partial<User>) => {
    if (!user) return;
    
    const updatedUser = { ...user, ...updates };
    setUser(updatedUser);
    localStorage.setItem('FridgeChef_user', JSON.stringify(updatedUser));
    
    // Apply theme changes immediately
    if (updates.theme) {
      if (updates.theme === 'dark') {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    }
  };

  const value: AuthContextType = {
    user,
    login,
    logout,
    updateUser,
    isAuthenticated: !!user,
    isGuest: !user,
    loading,
    guestId
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
