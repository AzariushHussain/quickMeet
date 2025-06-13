/**
 * Helper function to deduplicate participant streams
 * 
 * This function takes an array of participant stream objects and returns a deduplicated array
 * where only one stream exists per participant (either by producer ID or email).
 * 
 * @param {Array} streams - Array of participant stream objects
 * @returns {Array} Deduplicated array of streams
 */
export const deduplicateStreams = (streams) => {
  if (!streams || streams.length <= 1) {
    return streams; // Nothing to deduplicate
  }
  
  console.log("Running stream deduplication...");
  
  // Step 1: Group streams by email and producerId
  const streamsByEmail = {};
  const streamsByProducerId = {};
  
  // Map streams by email and producerId for easy lookup
  streams.forEach(entry => {
    if (entry.email) {
      if (!streamsByEmail[entry.email]) {
        streamsByEmail[entry.email] = [];
      }
      streamsByEmail[entry.email].push(entry);
    }
    
    if (entry.producerId) {
      if (!streamsByProducerId[entry.producerId]) {
        streamsByProducerId[entry.producerId] = [];
      }
      streamsByProducerId[entry.producerId].push(entry);
    }
  });
  
  // Find duplicates (any email or producerId with more than one entry)
  const dedupedStreams = [];
  const processedEmails = new Set();
  const processedProducerIds = new Set();
  
  // First pass: Process by producerId (more reliable)
  Object.keys(streamsByProducerId).forEach(producerId => {
    const entries = streamsByProducerId[producerId];
    if (entries.length > 1) {
      console.log(`Found ${entries.length} duplicate entries for producer ID ${producerId.substring(0, 8)}`);
      
      // Sort by addedAt (descending) and keep the most recent
      entries.sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
      
      // Keep the most recent entry with valid tracks
      const validEntry = entries.find(entry => 
        entry.stream && 
        entry.stream.getTracks && 
        entry.stream.getTracks().length > 0 &&
        entry.stream.getTracks().some(track => track.readyState !== 'ended')
      ) || entries[0]; // Fallback to most recent if none have valid tracks
      
      dedupedStreams.push(validEntry);
      processedProducerIds.add(producerId);
      
      // Mark the email as processed too
      if (validEntry.email) {
        processedEmails.add(validEntry.email);
      }
    } else if (entries.length === 1) {
      // Only one entry for this producerId
      dedupedStreams.push(entries[0]);
      processedProducerIds.add(producerId);
      
      // Mark the email as processed too
      if (entries[0].email) {
        processedEmails.add(entries[0].email);
      }
    }
  });
  
  // Second pass: Process any remaining entries by email
  Object.keys(streamsByEmail).forEach(email => {
    // Skip if already processed by producerId
    if (processedEmails.has(email)) return;
    
    const entries = streamsByEmail[email];
    if (entries.length > 1) {
      console.log(`Found ${entries.length} duplicate entries for email ${email}`);
      
      // Sort by addedAt (descending) and keep the most recent
      entries.sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
      
      // Keep the most recent entry with valid tracks
      const validEntry = entries.find(entry => 
        entry.stream && 
        entry.stream.getTracks && 
        entry.stream.getTracks().length > 0 &&
        entry.stream.getTracks().some(track => track.readyState !== 'ended')
      ) || entries[0]; // Fallback to most recent if none have valid tracks
      
      dedupedStreams.push(validEntry);
    } else if (entries.length === 1) {
      // Only one entry for this email
      dedupedStreams.push(entries[0]);
    }
  });
  
  // Log the results of deduplication
  if (dedupedStreams.length < streams.length) {
    console.log(`Deduplication removed ${streams.length - dedupedStreams.length} duplicate streams.`);
    console.log(`Current streams: ${dedupedStreams.length}`, 
      dedupedStreams.map(p => `${p.email} (${p.producerId?.substring(0, 5)})`));
  } else {
    console.log("No duplicates found during deduplication.");
  }
  
  return dedupedStreams;
};

/**
 * Helper function to check if two streams represent the same participant
 * 
 * @param {Object} stream1 - First stream object
 * @param {Object} stream2 - Second stream object
 * @returns {boolean} True if streams represent the same participant
 */
export const isSameParticipant = (stream1, stream2) => {
  if (!stream1 || !stream2) return false;
  
  // Check producer ID first (most reliable) if both have it
  if (stream1.producerId && stream2.producerId) {
    return stream1.producerId === stream2.producerId;
  }
  
  // If only one has producer ID but emails match
  if (stream1.email && stream2.email) {
    return stream1.email === stream2.email;
  }
  
  return false;
};
