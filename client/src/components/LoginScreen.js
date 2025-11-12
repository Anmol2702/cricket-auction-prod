import React, { useState } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import './LoginScreen.css';

const LoginScreen = ({ onLogin }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  // Re-determine serverUrl here as it's a standalone component
  const serverUrl = process.env.NODE_ENV === 'production'
    ? 'http://65.1.148.141:3001'
    : `http://${window.location.hostname}:3001`;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    console.log('Attempting login with username:', username, 'and password:', password); // NEW DEBUG LOG
    console.log('Login attempt started for user:', username); // DEBUG LOG
    try {
      const response = await axios.post(`${serverUrl}/login`, { username, password });
      console.log('Login successful. Server responded:', response.data); // DEBUG LOG
      // onLogin is called with the user object returned from the server
      onLogin(response.data);
    } catch (error) {
      toast.error(error.response?.data || 'Login failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <form onSubmit={handleSubmit} className="login-form">
        <h2>Cricket Auction Login</h2>
        <div className="form-group">
          <label htmlFor="username">Username</label>
          <input
            type="text"
            id="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
        </div>
        <div className="form-group">
          <label htmlFor="password">Password</label>
          <input
            type="password"
            id="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        <button type="submit" disabled={loading}>
          {loading ? 'Logging in...' : 'Login'}
        </button>
      </form>
    </div>
  );
};

export default LoginScreen;
