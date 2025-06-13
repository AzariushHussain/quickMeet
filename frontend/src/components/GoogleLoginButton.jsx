import { auth, provider, signInWithPopup, signOut } from "../firebase";
import { useDispatch, useSelector } from "react-redux";
import { loginSuccess, logoutSuccess } from "../store/authSlice";
import { loginUser } from '../api/user';
import ProfileImage from "./ProfileImage";

export default function GoogleLoginButton() {
  const dispatch = useDispatch();
  const user = useSelector((state) => state.auth.user);

  const login = async () => {
    try {
      const result = await signInWithPopup(auth, provider);
      console.log("user data", result.user);
      const response = await loginUser(result.user.uid, result.user.displayName, result.user.email, result.user.photoURL);
      dispatch(loginSuccess({ uid: result.user.uid, displayName: result.user.displayName, email: result.user.email, photoURL: result.user.photoURL, token: response.userToken }));    } catch (error) {
      console.error(error);
    }
  };

  const logout = () => {
    signOut(auth);
    dispatch(logoutSuccess());
  };
  return (
    <div className="w-full flex justify-center">
      {user ? (        <div className="flex flex-col items-center bg-white dark:bg-gray-700 p-4 rounded-lg shadow-md">
          <div className="relative">
            <ProfileImage 
              src={user.photoURL}
              alt="Profile"
              name={user.displayName || user.email}
              size={64}
              className="border-2 border-primary"
              fallbackBgColor="3b82f6"
            />
            <div className="absolute bottom-0 right-0 w-4 h-4 bg-green-500 rounded-full border-2 border-white"></div>
          </div>
          <p className="mt-2 font-medium text-gray-800 dark:text-gray-200">{user.displayName}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">{user.email}</p>
          <button 
            onClick={logout} 
            className="mt-3 bg-red-500 hover:bg-red-600 transition-colors text-white px-4 py-2 rounded-md text-sm font-medium shadow-sm">
            Logout
          </button>
        </div>
      ) : (
        <button 
          onClick={login} 
          className="flex items-center justify-center w-full bg-white dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 text-gray-800 dark:text-white font-medium py-3 px-6 rounded-lg border border-gray-300 dark:border-gray-600 transition-colors shadow-md">
          <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
          </svg>
          Sign in with Google
        </button>
      )}
    </div>
  );
}
