// Enhanced Mascot & Character Illustrations (Refined for Dark Blue Card & Light Backgrounds)
const MascotSVGs = {
  // Mascot on Laptop (Typing diligently with Coffee & Sparkles - High Contrast on Dark Blue)
  laptopBlob: `
    <svg viewBox="0 0 220 180" class="w-full h-auto drop-shadow-lg select-none" fill="none" xmlns="http://www.w3.org/2000/svg">
      <!-- Curved 4-Point Star Sparkles (Gold & White) -->
      <path d="M185 22 Q185 30 193 30 Q185 30 185 38 Q185 30 177 30 Q185 30 185 22 Z" fill="#FBBF24"/>
      <path d="M25 35 Q25 40 30 40 Q25 40 25 45 Q25 40 20 40 Q25 40 25 35 Z" fill="#FFFFFF"/>
      <circle cx="38" cy="22" r="2.5" fill="#93C5FD"/>
      <circle cx="48" cy="22" r="1.8" fill="#FDE68A"/>

      <!-- Chat Bubble -->
      <g transform="translate(150, 42)">
        <rect width="38" height="24" rx="8" fill="#FFFFFF" stroke="#93C5FD" stroke-width="1.5" filter="drop-shadow(0 2px 4px rgba(0,0,0,0.15))"/>
        <circle cx="10" cy="12" r="2.5" fill="#1E5AF6"/>
        <circle cx="19" cy="12" r="2.5" fill="#1E5AF6"/>
        <circle cx="28" cy="12" r="2.5" fill="#1E5AF6"/>
      </g>

      <!-- Main Blue Character Body (Vibrant Electric Blue with Soft Shadow) -->
      <path d="M85 170 C85 62 95 32 135 32 C175 32 185 62 185 170 Z" fill="#2563EB" stroke="#60A5FA" stroke-width="2"/>
      
      <!-- Big Eyes Looking DOWN at laptop with dual catchlights -->
      <ellipse cx="122" cy="85" rx="10" ry="12" fill="#FFFFFF"/>
      <circle cx="125" cy="88" r="5.5" fill="#0B1B3D"/>
      <circle cx="127" cy="86" r="2.2" fill="#FFFFFF"/>
      <circle cx="123" cy="90" r="1.2" fill="#FFFFFF"/>

      <ellipse cx="148" cy="85" rx="10" ry="12" fill="#FFFFFF"/>
      <circle cx="145" cy="88" r="5.5" fill="#0B1B3D"/>
      <circle cx="147" cy="86" r="2.2" fill="#FFFFFF"/>
      <circle cx="143" cy="90" r="1.2" fill="#FFFFFF"/>

      <!-- Cute Blushing Cheeks -->
      <ellipse cx="110" cy="98" rx="5.5" ry="2.8" fill="#93C5FD" opacity="0.9"/>
      <ellipse cx="160" cy="98" rx="5.5" ry="2.8" fill="#93C5FD" opacity="0.9"/>

      <!-- Hand holding stylus/pen -->
      <path d="M152 118 C162 118 170 126 166 138 C162 144 148 148 138 140 Z" fill="#3B82F6"/>
      <path d="M166 112 L150 142 L146 138 L162 108 Z" fill="#0F172A"/>

      <!-- Laptop Base & Screen (Angled with Glowing White Apple-like Dot) -->
      <g transform="translate(30, 105)">
        <rect x="25" y="5" width="88" height="55" rx="8" fill="#0F172A" stroke="#334155" stroke-width="2.5" transform="skewX(-10)"/>
        <circle cx="66" cy="32" r="5.5" fill="#F8FAFC"/>
        <path d="M10 60 L125 60 L118 72 L3 72 Z" fill="#020617"/>
      </g>

      <!-- Coffee Mug with Steam -->
      <g transform="translate(170, 130)">
        <rect x="0" y="5" width="25" height="28" rx="6" fill="#1D4ED8" stroke="#93C5FD" stroke-width="1.5"/>
        <path d="M24 10 C31 10 31 23 24 23" stroke="#93C5FD" stroke-width="2.5" fill="none" stroke-linecap="round"/>
        <path d="M7 0 Q10 -4 7 -8" stroke="#FDE68A" stroke-width="1.8" stroke-linecap="round" fill="none"/>
        <path d="M15 0 Q18 -4 15 -8" stroke="#FDE68A" stroke-width="1.8" stroke-linecap="round" fill="none"/>
      </g>
    </svg>
  `,

  // Cheering QR Mascot (Welcoming attendees with open arms & happy smile)
  cheeringBlob: `
    <svg viewBox="0 0 160 125" class="w-full h-auto drop-shadow-sm select-none" fill="none" xmlns="http://www.w3.org/2000/svg">
      <!-- Star Sparkles -->
      <path d="M22 25 Q22 32 29 32 Q22 32 22 39 Q22 32 15 32 Q22 32 22 25 Z" fill="#F59E0B"/>
      <path d="M140 18 Q140 24 146 24 Q140 24 140 30 Q140 24 134 24 Q140 24 140 18 Z" fill="#1E5AF6"/>
      
      <!-- Body -->
      <path d="M45 115 C45 35 55 15 80 15 C105 15 115 35 115 115 Z" fill="#1E5AF6"/>

      <!-- Raised Cheerful Arms -->
      <path d="M48 68 C34 52 22 46 18 56 C14 65 28 78 45 78 Z" fill="#1E5AF6"/>
      <path d="M112 68 C126 52 138 46 142 56 C146 65 132 78 115 78 Z" fill="#1E5AF6"/>

      <!-- Smiling Eyes with Dual Catchlights -->
      <ellipse cx="69" cy="50" rx="8" ry="10" fill="#FFFFFF"/>
      <circle cx="70" cy="50" r="5" fill="#0B1B3D"/>
      <circle cx="72" cy="48" r="1.8" fill="#FFFFFF"/>
      <circle cx="68" cy="52" r="0.9" fill="#FFFFFF"/>

      <ellipse cx="91" cy="50" rx="8" ry="10" fill="#FFFFFF"/>
      <circle cx="90" cy="50" r="5" fill="#0B1B3D"/>
      <circle cx="92" cy="48" r="1.8" fill="#FFFFFF"/>
      <circle cx="88" cy="52" r="0.9" fill="#FFFFFF"/>

      <!-- Cheerful Curved Smile -->
      <path d="M74 65 Q80 72 86 65" stroke="#FFFFFF" stroke-width="2.5" stroke-linecap="round" fill="none"/>
    </svg>
  `,

  // Mystery Mascot for Blind / Contest Mode
  mysteryBlob: `
    <svg viewBox="0 0 140 120" class="w-24 h-24 mx-auto select-none" fill="none" xmlns="http://www.w3.org/2000/svg">
      <!-- Glow & Starfield -->
      <circle cx="70" cy="60" r="48" fill="#1E3A8A" opacity="0.4"/>
      <path d="M25 35 Q25 40 30 40 Q25 40 25 45 Q25 40 20 40 Q25 40 25 35 Z" fill="#F59E0B"/>
      <path d="M115 25 Q115 30 120 30 Q115 30 115 35 Q115 30 110 30 Q115 30 115 25 Z" fill="#60A5FA"/>
      
      <!-- Body -->
      <path d="M40 105 C40 45 48 30 70 30 C92 30 100 45 100 105 Z" fill="#1E5AF6"/>

      <!-- Curious Big Glowing Eyes -->
      <ellipse cx="60" cy="62" rx="9" ry="11" fill="#FFFFFF"/>
      <circle cx="62" cy="62" r="5.5" fill="#0B1B3D"/>
      <circle cx="64" cy="60" r="2.2" fill="#FFFFFF"/>
      <circle cx="60" cy="64" r="1" fill="#93C5FD"/>

      <ellipse cx="80" cy="62" rx="9" ry="11" fill="#FFFFFF"/>
      <circle cx="78" cy="62" r="5.5" fill="#0B1B3D"/>
      <circle cx="80" cy="60" r="2.2" fill="#FFFFFF"/>
      <circle cx="76" cy="64" r="1" fill="#93C5FD"/>

      <!-- Golden Lock Badge -->
      <g transform="translate(56, 78)">
        <rect width="28" height="22" rx="6" fill="#F59E0B" filter="drop-shadow(0 2px 4px rgba(0,0,0,0.3))"/>
        <path d="M8 0 C8 -5 20 -5 20 0 L20 4 L8 4 Z" stroke="#F59E0B" stroke-width="3" fill="none"/>
        <circle cx="14" cy="11" r="2.5" fill="#0B1B3D"/>
      </g>
    </svg>
  `,

  // Single Smiling Avatar
  singleBlob: `
    <svg viewBox="0 0 100 100" class="w-full h-full select-none" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M20 90 C20 30 30 10 50 10 C70 10 80 30 80 90 Z" fill="#1E5AF6"/>
      <ellipse cx="40" cy="42" rx="7.5" ry="9.5" fill="#FFFFFF"/>
      <circle cx="42" cy="42" r="4.8" fill="#0B1B3D"/>
      <circle cx="44" cy="40" r="1.6" fill="#FFFFFF"/>
      
      <ellipse cx="60" cy="42" rx="7.5" ry="9.5" fill="#FFFFFF"/>
      <circle cx="58" cy="42" r="4.8" fill="#0B1B3D"/>
      <circle cx="60" cy="40" r="1.6" fill="#FFFFFF"/>
      
      <ellipse cx="32" cy="54" rx="4" ry="2" fill="#93C5FD"/>
      <ellipse cx="68" cy="54" rx="4" ry="2" fill="#93C5FD"/>
    </svg>
  `
};
