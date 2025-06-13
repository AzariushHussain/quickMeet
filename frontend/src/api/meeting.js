import axios from 'axios';

const API_URL = `${import.meta.env.VITE_APP_API_URL}/meeting`;

export const getMeetingLink = async (token) => {
    const response = await axios.post(`${API_URL}/create`, {}, {
        headers: {
            Authorization: `Bearer ${token}`
        }
    });
    return response.data.data;
};

export const getMeeting = async (meetingId, token) => {
    const response = await axios.get(`${API_URL}/${meetingId}`, {
        headers: {
            Authorization: `Bearer ${token}`
        }
    });
    return response.data.data;
}

export const getMeetingHistory = async (token) => {
    const response = await axios.get(`${API_URL}/history`, {
        headers: {
            Authorization: `Bearer ${token}`
        }
    });
    return response.data.data;
};

export const saveTranscriptMessage = async (meetingId, text, token) => {
    const response = await axios.post(`${API_URL}/${meetingId}/transcript`, 
        { text }, 
        {
            headers: {
                Authorization: `Bearer ${token}`
            }
        }
    );
    return response.data.data;
};

export const saveMeetingSummary = async (meetingId, summary, token) => {
    const response = await axios.post(`${API_URL}/${meetingId}/summary`, 
        { summary }, 
        {
            headers: {
                Authorization: `Bearer ${token}`
            }
        }
    );
    return response.data.data;
};

export const endMeeting = async (meetingId, duration, token) => {
    const response = await axios.post(`${API_URL}/${meetingId}/end`, 
        { duration }, 
        {
            headers: {
                Authorization: `Bearer ${token}`
            }
        }
    );
    return response.data.data;
};