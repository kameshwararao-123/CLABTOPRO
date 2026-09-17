const StatCard = ({ title, value, icon, description }) => {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">

      <div className="mb-4 flex items-center justify-between">
        <div className="rounded-xl bg-indigo-50 p-3 text-indigo-600">
          {icon}
        </div>
      </div>

      <p className="text-sm text-slate-500">
        {title}
      </p>

      <h3 className="mt-1 text-3xl font-bold text-slate-800">
        {value}
      </h3>

      {description && (
        <p className="mt-1 text-xs text-slate-400">
          {description}
        </p>
      )}

    </div>
  );
};

export default StatCard;