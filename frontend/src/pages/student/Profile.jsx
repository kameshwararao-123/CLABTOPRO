import { useAuth } from "../../context/AuthContext";

const Profile = () => {
  const { user } = useAuth();

  return (
    <div className="mx-auto max-w-3xl">

      <h1 className="text-3xl font-bold text-slate-800">
        Profile
      </h1>

      <div className="mt-6 rounded-2xl bg-white p-7 shadow-sm">

        <div className="mb-7 flex items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-indigo-100 text-2xl font-bold text-indigo-600">
            {user?.username?.charAt(0)?.toUpperCase()}
          </div>

          <div>
            <h2 className="text-xl font-bold text-slate-800">
              {user?.username}
            </h2>

            <p className="text-sm text-slate-500">
              Student
            </p>
          </div>
        </div>

        <div className="space-y-4">

          <div>
            <p className="text-xs text-slate-400">
              Username
            </p>

            <p className="mt-1 font-medium text-slate-700">
              {user?.username}
            </p>
          </div>

          <div>
            <p className="text-xs text-slate-400">
              Roll Number
            </p>

            <p className="mt-1 font-medium text-slate-700">
              {user?.rollNo}
            </p>
          </div>

          <div>
            <p className="text-xs text-slate-400">
              Email
            </p>

            <p className="mt-1 font-medium text-slate-700">
              {user?.email}
            </p>
          </div>

        </div>

      </div>

    </div>
  );
};

export default Profile;