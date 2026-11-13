const value = process.env.EXPO_PUBLIC_API_URL;
let origin;

try {
  origin = new URL(value);
} catch {
  // Report missing or invalid configuration without printing its value.
}

if (!origin || origin.protocol !== 'https:' || origin.username || origin.password ||
    origin.pathname !== '/' || origin.search || origin.hash || value !== value.trim()) {
  console.error('Set EXPO_PUBLIC_API_URL to the HTTPS origin of your deployed WishYou app in this EAS environment. Do not include /api or another path.');
  process.exitCode = 1;
}
