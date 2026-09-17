const StreakCard = ({ streak = 0 }) => {
  return (
    <div className="rounded-2xl bg-gradient-to-r from-indigo-600 to-purple-600 p-6 text-white shadow-lg">

      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-indigo-100">
            Current Streak
          </p>

          <h2 className="mt-2 text-4xl font-bold">
            {streak} 🔥
          </h2>

          <p className="mt-2 text-sm text-indigo-100">
            {streak === 0
              ? "Start solving today!"
              : "Keep your streak alive!"}
          </p>
        </div>

        <div className="text-6xl">
          🔥
        </div>
      </div>

    </div>
  );
};

export default StreakCard;