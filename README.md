<p align="center">
  <img src="johanrohith.me/eco-count/assets/eco-count-readme-banner.svg" alt="Eco Count — Know it. Count it. Reduce it." width="100%">
</p>

Eco Count helps you record everyday plastic use, check items through text or photos, and understand practical ways to reduce, reuse, and recycle what you consume.

<p align="center">
  <a href="https://johanrohith.me/eco-count/"><img src="https://img.shields.io/badge/OPEN-ECO%20COUNT%20%E2%86%97-2B5546?style=for-the-badge&logo=googlechrome&logoColor=white" alt="Open Eco Count"></a>
</p>

## Features

- **Item checks** — Describe an item or add a photo to help check whether it may contain plastic.
- **Plastic information** — View available material and classification details when enough information is available.
- **Actionable advice** — Get item-related suggestions for reducing, reusing, and recycling plastic.
- **Personal count and history** — Record quantities, review previous entries, and edit saved items.
- **Weekly insights** — View usage trends, unique items, and frequently recorded items.
- **Recommendations** — See practical prompts based on the items you track.
- **Data portability** — Export history as CSV or back up and restore it as JSON.

## Tech Stack

<p align="center">
  <img src="https://skillicons.dev/icons?i=html,css,js,vercel,github" height="50" alt="HTML, CSS, JavaScript, Vercel and GitHub">
</p>
<p align="center">
  <img src="https://img.shields.io/badge/Google%20Gemini-AI%20API-4285F4?style=flat-square" alt="Google Gemini API">
  <img src="https://img.shields.io/badge/JSON-Data%20file-6B7280?style=flat-square&logo=json&logoColor=white" alt="JSON data">
  <img src="https://img.shields.io/badge/Browser%20Storage-Local%20history-6B7280?style=flat-square" alt="Browser storage">
</p>

---

## Why Eco Count?

Plastic use can be difficult to notice when each item feels like a small, separate choice. Eco Count makes those habits easier to see by turning everyday items into a trackable record and pairing identification with practical next steps. Its goal is to help people make more informed, repeatable decisions about plastic use—not simply count waste.

## How It Works

Eco Count checks items against a local plastic knowledge file. When a check needs extra verification or includes a photo, the frontend can call the Vercel API, which uses Google Gemini to return a structured result and related guidance. The usage history is kept in the browser and can be exported or backed up by the user.

---

<p align="center">
  <strong>Eco Count</strong><br>
  <em>Know it. Count it. Reduce it.</em><br>
  <sub>Made by Johan Rohith</sub>
</p>
