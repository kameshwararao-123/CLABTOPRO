const Input = ({
  label,
  type = "text",
  name,
  value,
  onChange,
  placeholder,
  required = false,
}) => {
  return (
    <div className="space-y-2">

      <label className="text-sm font-medium text-slate-700">
        {label}
      </label>

      <input
        type={type}
        name={name}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        required={required}
        className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
      />

    </div>
  );
};

export default Input;