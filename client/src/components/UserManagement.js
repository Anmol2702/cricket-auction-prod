import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import './UserManagement.css';

const UserManagement = ({ serverUrl }) => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchUsers = useCallback(async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${serverUrl}/users`);
      setUsers(response.data);
    } catch (error) {
      toast.error('Failed to fetch users.');
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, [serverUrl]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleResetPassword = async (userId, username) => {
    if (window.confirm(`Are you sure you want to reset the password for ${username}?`)) {
      try {
        const response = await axios.post(`${serverUrl}/users/${userId}/reset-password`);
        toast.success(`Password for ${username} has been reset.`);
        // Display the new password to the auctioneer
        alert(`New password for ${username}: ${response.data.newPassword}\n\nPlease share this securely.`);
      } catch (error) {
        toast.error(error.response?.data || 'Failed to reset password.');
        console.error(error);
      }
    }
  };

  if (loading) {
    return <div>Loading users...</div>;
  }

  return (
    <div className="user-management-container">
      <h2>User Management</h2>
      <p>Initial passwords are logged on the server console when the auction is reset.</p>
      <table className="user-table">
        <thead>
          <tr>
            <th>Username</th>
            <th>Role</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {users.map(user => (
            <tr key={user.id}>
              <td>{user.username}</td>
              <td>{user.role}</td>
              <td>
                {user.role === 'team_owner' && (
                  <button className="reset-btn" onClick={() => handleResetPassword(user.id, user.username)}>
                    Reset Password
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default UserManagement;

