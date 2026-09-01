/**
 * Twenty-line blur placeholders for the art, as data URIs.
 *
 * GENERATED, DO NOT HAND-EDIT. Each is the matching WebP in `public/nemesis/art`
 * downsampled to 40px on its long edge, which lands every one of them under 450
 * bytes of base64 — small enough that inlining them costs less than the extra
 * request a file-based placeholder would need, and `next/image` requires a data
 * URI here rather than a path.
 *
 * To regenerate after re-rendering the art:
 *   cwebp -q 40 -resize 40 0 <src>.png -o <name>-blur.webp
 * then re-run the snippet in the landing README.
 *
 * The two `*_WASH_` entries are the exception to "downsampled render": their sources
 * are computed rather than generated. See scripts/art-wash.py, which carries its own
 * encode recipe at the foot of the file.
 */

export const HERO_BLUR =
  "data:image/webp;base64,UklGRooAAABXRUJQVlA4IH4AAADQBQCdASooABcAPulep02pJSOiNVgIASAdCWIAsR9tPSAhqyTNmo69W/dR9f1TT2xwg+Pd0mAAAP7nc+kC+v50odJPdYhTTF3Q2k1q+BGcMRkI6Wy+1MIEoheXHZQtT7/ba88GN9duz62eJnXRHxEisxwmcLo8uRkQ+e3cAAA=";

export const LEARN_BLUR =
  "data:image/webp;base64,UklGRtgAAABXRUJQVlA4IMwAAABwBwCdASooACgAPt1Yp02opSOiNVgNURAbiWIAv2tKvOyWj0Ho6ocEp7FuA83tg1MJDmzcZ7Iq07/yEp7USTl5lp1RoAD+83+75wAJZaXWD5CIcbtidOHqnawe9rpRrpNkJcJ0FNHTbc/n+FX+daPYTbXqUxvxHokCQNt+K2FCKb9vLWww6ejOJKF1hq24hHTtj3QBbXwifaddRUIiJQECfhmOMcB8+SodSBYO93mLwgt36bx0eJNGug+ayU1kWruTMRwzhoYu5wO6QAA=";

/* The two computed washes. Everything else in this file is a downsample of a
   GENERATED render; these two are downsamples of a gradient this repo draws
   itself, so they have no grain in them at any size. See scripts/art-wash.py. */
export const VOICE_WASH_BLUR =
  "data:image/webp;base64,UklGRm4AAABXRUJQVlA4IGIAAABQBACdASooACgAPu10sFEppySiqrqoATAdiWUAyFwK5g88Rs5RZAjLePRAAM1EXdas68UbIL+JtIucQvdgII8O2DZ06yaf928+81V4GYO9qzd4vdr/95HiuJMjWTjA0KyAAA==";

export const SEE_WASH_BLUR =
  "data:image/webp;base64,UklGRowAAABXRUJQVlA4IIAAAABwBgCdASooACgAPtlYok2oJSMiONtoAQAbCWMAgeEY6MZlUK+IrmrwWZB1EdsGyyr3e8u+ncqJE+Q0kWAA/vV60mjAnfu+M1EMmysLls0GslIn1oolFB0gk+tCWDEZNBAxkoPPOSoXLLl55jVj+GewuGo1cmOUWA+drr20AAAAAA==";

export const CLOSE_WASH_BLUR =
  "data:image/webp;base64,UklGRmoAAABXRUJQVlA4IF4AAACQBACdASooABYAPulgpk2pJaOjNVgIASAdCWMAyQehxs+ZS9sCnTjwDHovTdAA/vcAfic3BloxPylL6mAFNcnauAtDWUYYUmdzLO+Cflm/EdBpS7dB/eJ4RDmxwAAA";

export const EVIDENCE_WASH_BLUR =
  "data:image/webp;base64,UklGRogAAABXRUJQVlA4IHwAAACwBgCdASooACgAPtVco02oJaMiONtoAQAaiWMAeSgMdCzYIAq6bIVie9DvGwhCuvMpLEJtDvrYE/q4kAD0AAD+9KHL3bPbTYM05qukmOI77aU9j5lGcB9mNECJV6kgNmyqpZq+tqiAmwpK9LbGetmTlfM7Q82UHDxxAAAA";

export const CALENDAR_BLUR =
  "data:image/webp;base64,UklGRrwAAABXRUJQVlA4ILAAAADwBgCdASooACgAPu1mqlCppSOiqrVdUTAdiUAXDIVAlKj9KH/+T5W13+liW9c4WgCuaU2rMrXRfm8c7GPjymsAAP705WQcx+0A+o5TkCLqo0Ex6V2GOPhdoBnnKVwbq8dR3fvpy2oQfAikLQMBpOs/wwHta58Tg/t8vhWjHbcF82Ed4tFhSxLfjGn3eeeWF+WQZ1Dqc1iasOf6TnYS13Rt6RinwcgCxzAeXAHJfkgAAA==";

export const PRICING_BLUR =
  "data:image/webp;base64,UklGRrgAAABXRUJQVlA4IKwAAABwBgCdASooABcAPtVWoE2oJKMiNUwBABqJagCdM4m4uNgDMtY0SrieJVSDRJUoD2luxUcylUh+ZQBjDTAA/vQl531ke38nAZiFL7+HpageznDLQaKNpHynACWeQadOjuxpf8c2wuq63xBpcDGFfbGv5BnrqQtm7YH0iAXMcQ1VYlzGJ2R+6wu5BqiFqF1ZgEqHbEzf49l5BvfCT5bExLKmZilgJJo67cMY0AAA";

export const LEARN_FIGURE_BLUR =
  "data:image/webp;base64,UklGRv4AAABXRUJQVlA4IPIAAABwBgCdASooACgAPu1oqU2ppqQiLjv7MTAdiWcA0YHcC33LJoN1JiykgZ+gUXNR6qK+7pxG3GGYxn2rUOAA/vKU6/EsaqNZeByp8FdhBVqatIs4+6T9DWPxGGgdEZJ77yuwyxWH5rLXVUBHKjkmhOxDFHnPctfgyvPSCA/S/hN0A4Hlb519RAJ3W8/BjR978NZwTPl4PMx+i/vt2toBWNkXSokbSF0iokWp0N3ahC5XwPmbXYErUGRfLQZF+Wx5kp/SYMUXtfyvxe/ECQVRkOqtncOdIg6dXljr8VzMbla/J3pmD853H/pZOTkquTBlgAAAAA==";

export const EVIDENCE_FIGURE_BLUR =
  "data:image/webp;base64,UklGRjACAABXRUJQVlA4ICQCAADQCgCdASooACgAPu1qq1CppaOiqrVcATAdiUAYDV52tN6fGzy09KDNE8g8SZYTQwj1kk1UKa1CIA/bOTkzOvG6ILNPQ1J/E5eZ9iJOJ6MSy6zsz0Joid8mXrSm8JRuAAD+94IVvzqvdX8IbjFULQQ/dcqrweV8ErcvEMlTZymBTcX4XSADYHjBdM5rvrbimBBUttmLWbN8dfcmaP5uS7Q94tQTe15Jmzx7N5kDqxggpTFkHxbwBAtq7PmT7c3HTO1cKD7GIr9mARhCmBS8/TELGdhSK/yikPtfZXTcSlWgSB4gvnnO/IqPENqQnYIaSxNjxLFUYgsANRKv6uPHIIQp35VMVcxvU8Vps8p1IKp0KZQDpe+6J5TlyxBkIv9OJZJ6J3x30KVCnusNyTRmC7CE+14owsFUjdlphQKjo9tIQKuX5Ed65Rcl/AVYP6KVSvt/PFO5ckUM+8LUBrM9fIf8s++SFsJjT349C76iSwYVxEEPx2aedxdoCF8oraGBskPwG2pRAxORNzKNsRxwjfpaqp5b94p78SJHQYyX8CuSY6N0ZZGvYeTvtiPf82fN/Je0Zk9f2uJfofHyxrKtJvt+Zv/AtdioEmL/ru8NtT6k8w9MqDNfQrHy1yNh2wQC+iZrsUxqxGteDF/qguVu29kr8kTmltXSahPfRWhuP3peOtKFX8Pp15Z8uDJTzHxoVw66MpymF8lK4kb1wXnpwRjC7oyAAA==";
