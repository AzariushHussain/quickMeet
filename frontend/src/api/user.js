import axios from 'axios';

const API_URL= `${import.meta.env.VITE_APP_API_URL}/auth`

export const loginUser = async (uid, displayName, email, photoURL) => {
    const response = await axios.post(`${API_URL}/login`, { uid, displayName, email, photoURL });
    return response.data.data;
}