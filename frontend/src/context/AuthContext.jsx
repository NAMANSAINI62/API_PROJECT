import React, { createContext, useContext, useState } from 'react';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => {
    const savedUser = localStorage.getItem('user');
    return savedUser ? JSON.parse(savedUser) : null;
  });
  const [token, setToken] = useState(() => localStorage.getItem('token') || null);
  const [selectedProjectId, setSelectedProjectId] = useState(() => localStorage.getItem('selectedProjectId') || '');

  const loginUser = (authData) => {
    localStorage.setItem('token', authData.access_token);
    localStorage.setItem('user', JSON.stringify(authData.user));
    setToken(authData.access_token);
    setUser(authData.user);
  };

  const logoutUser = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('selectedProjectId');
    setToken(null);
    setUser(null);
    setSelectedProjectId('');
  };

  const handleSelectProject = (id) => {
    setSelectedProjectId(id);
    if (id) {
      localStorage.setItem('selectedProjectId', id);
    } else {
      localStorage.removeItem('selectedProjectId');
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loginUser,
        logoutUser,
        selectedProjectId,
        setSelectedProjectId: handleSelectProject,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
