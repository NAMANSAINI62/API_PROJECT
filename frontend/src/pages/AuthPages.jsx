import React, { useState } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { authService } from '../services/api';
import { Card, Input, Button } from '../components/UIComponents';

export const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { loginUser } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const successMessage = location.state?.message;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await authService.login(email, password);
      loginUser(data);
      navigate('/overview');
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to sign in. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F7F9FB] flex flex-col justify-center items-center p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex p-3 bg-[#159A8A]/15 text-[#159A8A] border border-[#159A8A]/30 rounded-2xl mb-2">
            <ShieldCheck className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-[#17212B]">Welcome back</h1>
          <p className="text-xs text-[#687680]">Sign in to your PulseGate developer account</p>
        </div>

        <Card className="shadow-xs border-[#E1E7EB]">
          <form onSubmit={handleSubmit} className="space-y-4">
            {successMessage && (
              <div className="p-3 bg-[#E8F8F5] border border-[#159A8A]/30 rounded-lg text-xs text-[#118274] font-medium">
                {successMessage}
              </div>
            )}
            {error && (
              <div className="p-3 bg-[#FDEEEE] border border-[#E05B5B]/30 rounded-lg text-xs text-[#B63F3F]">
                {error}
              </div>
            )}
            <Input

              label="Email"
              type="email"
              placeholder="name@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <Input
              label="Password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <Button type="submit" isLoading={loading} className="w-full bg-[#159A8A] hover:bg-[#118274]">
              Sign In
            </Button>
          </form>
        </Card>

        <p className="text-center text-xs text-[#687680]">
          Don't have an account?{' '}
          <Link to="/register" className="text-[#159A8A] hover:text-[#118274] font-medium">
            Create account
          </Link>
        </p>
      </div>
    </div>
  );
};

export const Register = () => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { loginUser } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await authService.register(name, email, password);
      navigate('/login', { state: { message: 'Account created successfully! Please sign in.' } });
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to create account.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F7F9FB] flex flex-col justify-center items-center p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex p-3 bg-[#159A8A]/15 text-[#159A8A] border border-[#159A8A]/30 rounded-2xl mb-2">
            <ShieldCheck className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-[#17212B]">Create your account</h1>
          <p className="text-xs text-[#687680]">Get started with PulseGate API Gateway</p>
        </div>

        <Card className="shadow-xs border-[#E1E7EB]">
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-3 bg-[#FDEEEE] border border-[#E05B5B]/30 rounded-lg text-xs text-[#B63F3F]">
                {error}
              </div>
            )}
            <Input
              label="Name"
              type="text"
              placeholder="Alex Smith"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
            <Input
              label="Email"
              type="email"
              placeholder="name@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <Input
              label="Password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <Button type="submit" isLoading={loading} className="w-full bg-[#159A8A] hover:bg-[#118274]">
              Create Account
            </Button>
          </form>
        </Card>

        <p className="text-center text-xs text-[#687680]">
          Already have an account?{' '}
          <Link to="/login" className="text-[#159A8A] hover:text-[#118274] font-medium">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
};
