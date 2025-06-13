import { configureStore } from "@reduxjs/toolkit";
import authReducer from "./authSlice";
import meetingReducer from "./meetingSlice";

const store = configureStore({
  reducer: {
    auth: authReducer,
    meeting: meetingReducer,
  },
});

export default store;
