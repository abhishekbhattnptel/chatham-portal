// GitHub API integration for Chatham Portal
// This file handles saving and fetching rota data from GitHub

const GITHUB_REPO = 'abhishekk/chatham-portal'; // Update this to your actual repository
const GITHUB_TOKEN = 'ghp_1234567890abcdef'; // Replace with your actual GitHub token

// Helper function to make GitHub API requests
async function makeGitHubRequest(endpoint, method = 'GET', body = null) {
  const url = `https://api.github.com/repos/${GITHUB_REPO}${endpoint}`;
  
  const options = {
    method,
    headers: {
      'Authorization': `token ${GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
    },
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  try {
    const response = await fetch(url, options);
    
    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('GitHub API request failed:', error);
    throw error;
  }
}

// Save week data to GitHub
export async function saveWeekData(weekStart, shiftsData, names) {
  try {
    console.log('🔄 Saving data to GitHub...');
    
    const data = {
      weekStart,
      shifts: shiftsData,
      names,
      lastUpdated: new Date().toISOString(),
      version: '1.0'
    };

    // Try to get existing file first
    let fileSha = null;
    try {
      const existingFile = await makeGitHubRequest(`/contents/rota-data.json`);
      fileSha = existingFile.sha;
    } catch (error) {
      // File doesn't exist yet, that's okay
      console.log('No existing file found, creating new one');
    }

    // Create or update the file
    const content = btoa(JSON.stringify(data, null, 2));
    
    const response = await makeGitHubRequest('/contents/rota-data.json', 'PUT', {
      message: `Update rota data for week ${weekStart}`,
      content,
      sha: fileSha
    });

    console.log('✅ Successfully saved data to GitHub');
    return true;
  } catch (error) {
    console.error('❌ Failed to save to GitHub:', error);
    return false;
  }
}

// Fetch rota data from GitHub
export async function fetchRotaData() {
  try {
    console.log('🔄 Fetching data from GitHub...');
    
    const response = await makeGitHubRequest('/contents/rota-data.json');
    const content = JSON.parse(atob(response.content));
    
    console.log('✅ Successfully fetched data from GitHub');
    return content;
  } catch (error) {
    console.error('❌ Failed to fetch from GitHub:', error);
    throw error;
  }
}

// Get week data for a specific week
export async function getWeekData(weekStart) {
  try {
    const data = await fetchRotaData();
    return data.weeks?.[weekStart] || null;
  } catch (error) {
    console.error('Failed to get week data:', error);
    return null;
  }
}
