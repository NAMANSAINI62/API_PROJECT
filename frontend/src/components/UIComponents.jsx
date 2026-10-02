import React from 'react';
import { Loader2, AlertCircle, Inbox, Plus } from 'lucide-react';

export const Card = ({ children, className = '' }) => (
  <div className={`bg-white border border-[#E4E9EE] rounded-xl p-5 shadow-2xs ${className}`}>
    {children}
  </div>
);

export const Button = ({
  children,
  variant = 'primary',
  size = 'md',
  isLoading = false,
  disabled = false,
  className = '',
  ...props
}) => {
  const base = 'inline-flex items-center justify-center font-medium rounded-lg transition-all duration-200 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed';
  
  const variants = {
    primary: 'bg-[#159A8A] hover:bg-[#118274] text-white active:scale-[0.98]',
    secondary: 'bg-white hover:bg-[#F1F4F6] text-[#34424D] border border-[#D7DEE5]',
    danger: 'bg-[#E05B5B] hover:bg-[#C94C4C] text-white',
    ghost: 'hover:bg-[#F1F4F6] text-[#687680] hover:text-[#17212B]',
  };

  const sizes = {
    sm: 'px-3 py-1.5 text-xs',
    md: 'px-4 py-2 text-sm',
    lg: 'px-5 py-2.5 text-base',
  };

  return (
    <button
      disabled={isLoading || disabled}
      className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
      {children}
    </button>
  );
};

export const Badge = ({ children, variant = 'neutral' }) => {
  const variants = {
    success: 'bg-[#EAF7EF] text-[#237A50] border-[#2FA36B]/30',
    warning: 'bg-[#FFF5E5] text-[#9A6817] border-[#E4A33B]/30',
    danger: 'bg-[#FDEEEE] text-[#B63F3F] border-[#E05B5B]/30',
    info: 'bg-[#EEF1FF] text-[#4968A6] border-[#6578B8]/30',
    neutral: 'bg-[#F1F4F6] text-[#687680] border-[#D7DEE5]',
  };

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 text-xs font-semibold rounded-full border ${variants[variant]}`}>
      {children}
    </span>
  );
};

export const Input = ({ label, error, className = '', ...props }) => (
  <div className="space-y-1.5 w-full">
    {label && <label className="block text-xs font-medium text-[#687680]">{label}</label>}
    <input
      className={`w-full px-3.5 py-2.5 bg-white border border-[#DCE3E8] rounded-lg text-[#17212B] text-sm placeholder-[#94A0AA] focus:outline-none focus:border-[#159A8A] focus:ring-1 focus:ring-[#159A8A]/20 transition-colors ${
        error ? 'border-[#E05B5B] focus:border-[#E05B5B] focus:ring-[#E05B5B]/20' : ''
      } ${className}`}
      {...props}
    />
    {error && <p className="text-xs text-[#B63F3F] mt-1">{error}</p>}
  </div>
);

export const Modal = ({ isOpen, onClose, title, children }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#101B24]/40 backdrop-blur-xs animate-fadeIn">
      <div className="bg-white border border-[#E4E9EE] rounded-xl max-w-lg w-full p-6 shadow-xl space-y-4 relative">
        <div className="flex items-center justify-between pb-3 border-b border-[#E4E9EE]">
          <h3 className="text-lg font-semibold text-[#17212B]">{title}</h3>
          <button
            onClick={onClose}
            className="text-[#8A969F] hover:text-[#17212B] text-xl font-bold p-1"
          >
            &times;
          </button>
        </div>
        <div>{children}</div>
      </div>
    </div>
  );
};

export const LoadingState = ({ message = 'Loading details...' }) => (
  <div className="flex flex-col items-center justify-center py-12 space-y-3 text-[#687680]">
    <Loader2 className="w-8 h-8 animate-spin text-[#159A8A]" />
    <p className="text-sm font-medium">{message}</p>
  </div>
);

export const EmptyState = ({
  title = 'No items found',
  description = 'Get started by creating a new item.',
  actionText,
  onAction,
}) => (
  <div className="flex flex-col items-center justify-center py-16 px-4 border border-dashed border-[#D7DEE5] rounded-xl text-center space-y-4 bg-[#F9FAFB]">
    <div className="p-3 bg-white border border-[#E4E9EE] rounded-full text-[#8A969F]">
      <Inbox className="w-8 h-8" />
    </div>
    <div className="space-y-1">
      <h3 className="text-base font-medium text-[#17212B]">{title}</h3>
      <p className="text-xs text-[#687680] max-w-sm">{description}</p>
    </div>
    {actionText && onAction && (
      <Button onClick={onAction} size="sm">
        <Plus className="w-4 h-4 mr-1.5" />
        {actionText}
      </Button>
    )}
  </div>
);

export const ErrorState = ({ message = 'Something went wrong', onRetry }) => (
  <div className="flex flex-col items-center justify-center py-10 space-y-3 text-[#B63F3F] bg-[#FDEEEE] border border-[#E05B5B]/30 rounded-xl p-6">
    <AlertCircle className="w-8 h-8" />
    <p className="text-sm font-medium">{message}</p>
    {onRetry && (
      <Button variant="secondary" size="sm" onClick={onRetry}>
        Try Again
      </Button>
    )}
  </div>
);

export const ConfirmModal = ({
  isOpen,
  onClose,
  onConfirm,
  title = 'Are you sure?',
  message = 'This action cannot be undone.',
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'danger',
  isLoading = false,
}) => {
  if (!isOpen) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title}>
      <div className="space-y-4">
        <p className="text-xs text-[#687680] leading-relaxed">{message}</p>
        <div className="flex justify-end space-x-3 pt-2">
          <Button variant="secondary" onClick={onClose} disabled={isLoading}>
            {cancelText}
          </Button>
          <Button variant={variant} onClick={onConfirm} isLoading={isLoading}>
            {confirmText}
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export const Toast = ({ message, type = 'success', onClose }) => {
  if (!message) return null;

  const bgStyles = {
    success: 'bg-[#EAF7EF] text-[#237A50] border-[#2FA36B]/30',
    error: 'bg-[#FDEEEE] text-[#B63F3F] border-[#E05B5B]/30',
    info: 'bg-[#EEF1FF] text-[#4968A6] border-[#6578B8]/30',
  };

  return (
    <div className={`fixed bottom-5 right-5 z-50 px-4 py-3 rounded-xl border shadow-xl text-xs font-medium flex items-center justify-between space-x-4 animate-slideUp ${bgStyles[type]}`}>
      <span>{message}</span>
      {onClose && (
        <button onClick={onClose} className="hover:opacity-75 font-bold">
          &times;
        </button>
      )}
    </div>
  );
};
