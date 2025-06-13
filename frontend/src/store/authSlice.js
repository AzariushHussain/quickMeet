import { createSlice } from "@reduxjs/toolkit";
import { act } from "react";

const initialState = {
  user: null,
};

const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    loginSuccess: (state, action) => {
      console.log("action", action);
      state.user = {
        uid: action.payload.uid,
        displayName: action.payload.displayName,
        email: action.payload.email,
        photoURL: action.payload.photoURL,
        token: action.payload.token,
      };
      console.log("user", state.user);
      localStorage.setItem('user', JSON.stringify(state.user));
    },
    logoutSuccess: (state) => {
      state.user = null;
      localStorage.removeItem('user');
      localStorage.removeItem('token');
    },
    setUserFromStorage: (state, action) => {
      // Set user and token from local storage when the app loads
      const user = localStorage.getItem('user') ? JSON.parse(localStorage.getItem('user')) : null;
      state.user = user;
    },
  },
});

export const { loginSuccess, logoutSuccess,  setUserFromStorage} = authSlice.actions;
export default authSlice.reducer;
