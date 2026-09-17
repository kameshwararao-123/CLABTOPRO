const Button = ({
  children,
  type = "button",
  onClick,
  disabled = false,
  className = "",
}) => {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`rounded-xl bg-indigo-600 px-5 py-3 font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
    >
      {children}
    </button>
  );
};

export default Button;