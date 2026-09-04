export interface PlatformTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  widthPx: number;
  heightPx: number;
  fields: string[];
  html: string;
}

export const platformTemplates: PlatformTemplate[] = [
  {
    id: "linkedin-banner",
    name: "LinkedIn Banner",
    description:
      "Professional banner for your LinkedIn profile. Features your logo, company name, tagline, and a call-to-action.",
    category: "Social Media",
    widthPx: 1200,
    heightPx: 630,
    fields: ["headline", "ctaText"],
    html: `<!DOCTYPE html><html><head><meta charset="utf-8"><style>html,body{margin:0;padding:0;}.banner{width:1200px;height:630px;background-color:{{ profile.brandColors.primary }};display:flex;flex-direction:column;box-sizing:border-box;padding:48px 64px;font-family:'Segoe UI',sans-serif;color:#ffffff;}.top{display:flex;align-items:center;}.logo{height:56px;border-radius:8px;}.spacer{flex:1;}.company{font-size:22px;opacity:.85;}.center{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;}.headline{font-size:72px;font-weight:800;margin:0;line-height:1.05;text-shadow:0 2px 8px rgba(0,0,0,.25);}.tagline{font-size:30px;margin-top:18px;opacity:.9;}.cta{margin-top:40px;background-color:{{ profile.brandColors.secondary }};color:#111827;font-size:26px;font-weight:700;padding:16px 40px;border-radius:9999px;}</style></head><body><div class="banner"><div class="top"><img class="logo" src="{{ profile.logo }}" alt="logo"><div class="spacer"></div><span class="company">{{ profile.displayName }}</span></div><div class="center"><h1 class="headline">{{ headline }}</h1><p class="tagline">{{ profile.tagline }}</p><div class="cta">{{ ctaText }}</div></div></div></body></html>`,
  },
  {
    id: "instagram-post",
    name: "Instagram Post",
    description:
      "Square post graphic for Instagram. Bold headline over a brand-colored background with your logo.",
    category: "Social Media",
    widthPx: 1080,
    heightPx: 1080,
    fields: ["headline", "subtext"],
    html: `<!DOCTYPE html><html><head><meta charset="utf-8"><style>html,body{margin:0;padding:0;}.post{width:1080px;height:1080px;background:{{ profile.brandColors.primary }};display:flex;flex-direction:column;align-items:center;justify-content:center;box-sizing:border-box;padding:80px;font-family:'Segoe UI',sans-serif;color:#fff;text-align:center;}.logo{height:80px;border-radius:12px;margin-bottom:48px;}.headline{font-size:64px;font-weight:800;margin:0;line-height:1.1;text-shadow:0 2px 12px rgba(0,0,0,.3);}.divider{width:100px;height:6px;background:{{ profile.brandColors.secondary }};border-radius:3px;margin:36px 0;}.subtext{font-size:32px;opacity:.85;margin:0;max-width:800px;line-height:1.4;}.company{position:absolute;bottom:48px;font-size:20px;opacity:.6;letter-spacing:2px;text-transform:uppercase;}</style></head><body><div class="post" style="position:relative"><img class="logo" src="{{ profile.logo }}" alt="logo"><h1 class="headline">{{ headline }}</h1><div class="divider"></div><p class="subtext">{{ subtext }}</p><span class="company">{{ profile.displayName }}</span></div></body></html>`,
  },
  {
    id: "twitter-header",
    name: "Twitter / X Header",
    description:
      "Wide header image for your Twitter or X profile. Clean layout with logo, display name, and tagline.",
    category: "Social Media",
    widthPx: 1500,
    heightPx: 500,
    fields: ["headline"],
    html: `<!DOCTYPE html><html><head><meta charset="utf-8"><style>html,body{margin:0;padding:0;}.header{width:1500px;height:500px;background:{{ profile.brandColors.primary }};display:flex;align-items:center;box-sizing:border-box;padding:0 120px;font-family:'Segoe UI',sans-serif;color:#fff;position:relative;overflow:hidden;}.header::after{content:"";position:absolute;right:-60px;top:-60px;width:300px;height:300px;border-radius:50%;background:{{ profile.brandColors.secondary }};opacity:.15;}.content{display:flex;align-items:center;gap:48px;z-index:1;}.logo{height:100px;width:100px;border-radius:16px;object-fit:contain;background:#fff1;}.text{}.name{font-size:48px;font-weight:800;margin:0;}.tagline{font-size:24px;opacity:.8;margin:8px 0 0 0;}.headline{font-size:28px;font-weight:600;margin-top:16px;color:{{ profile.brandColors.secondary }};}</style></head><body><div class="header"><div class="content"><img class="logo" src="{{ profile.logo }}" alt="logo"><div class="text"><h1 class="name">{{ profile.displayName }}</h1><p class="tagline">{{ profile.tagline }}</p><p class="headline">{{ headline }}</p></div></div></div></body></html>`,
  },
  {
    id: "email-header",
    name: "Email Header",
    description:
      "Compact header for email newsletters and campaigns. Logo and company name on a brand background.",
    category: "Email",
    widthPx: 600,
    heightPx: 200,
    fields: [],
    html: `<!DOCTYPE html><html><head><meta charset="utf-8"><style>html,body{margin:0;padding:0;}.email-header{width:600px;height:200px;background:{{ profile.brandColors.primary }};display:flex;align-items:center;justify-content:space-between;box-sizing:border-box;padding:0 48px;font-family:'Segoe UI',sans-serif;color:#fff;}.left{display:flex;align-items:center;gap:20px;}.logo{height:48px;border-radius:8px;}.company{font-size:28px;font-weight:700;}.tagline{font-size:16px;opacity:.75;margin-top:4px;}.accent{width:6px;height:80px;background:{{ profile.brandColors.secondary }};border-radius:3px;}</style></head><body><div class="email-header"><div class="left"><img class="logo" src="{{ profile.logo }}" alt="logo"><div><div class="company">{{ profile.displayName }}</div><div class="tagline">{{ profile.tagline }}</div></div></div><div class="accent"></div></div></body></html>`,
  },
  {
    id: "event-banner",
    name: "Event Banner",
    description:
      "Promotional banner for webinars, conferences, or events. Features date, title, and brand styling.",
    category: "Marketing",
    widthPx: 1200,
    heightPx: 628,
    fields: ["eventTitle", "eventDate"],
    html: `<!DOCTYPE html><html><head><meta charset="utf-8"><style>html,body{margin:0;padding:0;}.banner{width:1200px;height:628px;background:{{ profile.brandColors.primary }};display:flex;box-sizing:border-box;font-family:'Segoe UI',sans-serif;color:#fff;overflow:hidden;}.left{flex:1;display:flex;flex-direction:column;justify-content:center;padding:56px 64px;}.right{width:380px;background:{{ profile.brandColors.secondary }};display:flex;flex-direction:column;align-items:center;justify-content:center;position:relative;}.badge{font-size:18px;font-weight:700;text-transform:uppercase;letter-spacing:3px;opacity:.7;margin-bottom:12px;}.event-title{font-size:56px;font-weight:800;margin:0;line-height:1.1;}.event-date{font-size:28px;margin-top:24px;opacity:.85;font-weight:600;}.logo{height:48px;border-radius:8px;margin-top:32px;}.date-box{font-size:48px;font-weight:800;color:{{ profile.brandColors.primary }};text-align:center;}.month{font-size:20px;font-weight:600;text-transform:uppercase;letter-spacing:2px;margin-top:4px;}</style></head><body><div class="banner"><div class="left"><span class="badge">{{ profile.displayName }}</span><h1 class="event-title">{{ eventTitle }}</h1><p class="event-date">{{ eventDate }}</p><img class="logo" src="{{ profile.logo }}" alt="logo"></div><div class="right"><div class="date-box">{{ eventDate }}<div class="month">2025</div></div></div></div></body></html>`,
  },
];
