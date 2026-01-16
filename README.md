<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1ISbsGBzwjPerS7-ePzKdy1KaIWIZpJVd

## Run Locally

**Prerequisites:**  Node.js

1. Install dependencies:
   ```bash
   npm install
   ```

2. Configure environment variables:
   
   Copy the `.env.local` file and fill in your credentials:
   
   ```env
   # Gemini AI API Key
   GEMINI_API_KEY=your_gemini_api_key_here
   
   # Supabase Configuration
   SUPABASE_URL=your_supabase_project_url_here
   SUPABASE_ANON_KEY=your_supabase_anon_key_here
   
   # WordPress/WooCommerce Configuration
   WP_BASE_URL=https://corks.ro
   WP_USERNAME=your_wordpress_username_here
   WP_APP_PASSWORD=your_wordpress_app_password_here
   ```
   
   **Where to get these:**
   - **Gemini API Key**: Get from [Google AI Studio](https://aistudio.google.com/app/apikey)
   - **Supabase**: Get from your [Supabase Dashboard](https://supabase.com/dashboard) > Project Settings > API
   - **WordPress App Password**: Generate from WordPress Admin > Users > Your Profile > Application Passwords

3. Run the app:
   ```bash
   npm run dev
   ```

4. Open [http://localhost:3000](http://localhost:3000) in your browser
