const StatCard = ({ title, value, icon, description }) => {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm">

      <div className="mb-2.5 sm:mb-4 flex items-center justify-between">
        <div className="rounded-xl bg-indigo-50 p-2 sm:p-3 text-indigo-600">
          {icon}
        </div>
      </div>

      <p className="text-xs sm:text-sm text-slate-500 font-medium truncate">
        {title}
      </p>

      <h3 className="mt-1 text-2xl sm:text-3xl font-bold text-slate-800">
        {value}
      </h3>

      {description && (
        <p className="mt-1 text-[11px] sm:text-xs text-slate-400">
          {description}
        </p>
      )}

    </div>
  );
};

export default StatCard;