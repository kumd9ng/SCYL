/** Short origin notes, researched 2026-11-26. See docs/companion-origins.md.
 * Countries describe historical origin or documented breed development, not an
 * individual cat's nationality. Domestic coat types have no single country.
 * Keep both locales and source URLs together when updating a record.
 */
import { getCompanion } from './companion-catalog.mjs';

export const companionOrigins = Object.freeze({
  "domestic-shorthair": {
    "flag": "🌍",
    "region": {
      "ko": "전 세계",
      "en": "Worldwide"
    },
    "history": {
      "ko": "지역마다 이어져 온 단모 집고양이 유형이에요.",
      "en": "A worldwide type of shorthaired household cat."
    },
    "sources": [
      "https://tica.org/breed/household-pet/"
    ],
    "certainty": "documented"
  },
  "british-shorthair": {
    "flag": "🇬🇧",
    "region": {
      "ko": "영국",
      "en": "UK"
    },
    "history": {
      "ko": "영국의 집고양이를 바탕으로 정립된 오랜 품종이에요.",
      "en": "An old breed developed from British domestic cats."
    },
    "sources": [
      "https://tica.org/breed/british-shorthair/",
      "https://cfa.org/breed/british-shorthair/"
    ],
    "certainty": "documented"
  },
  "russian-blue": {
    "flag": "🌍",
    "region": {
      "ko": "러시아 추정",
      "en": "Possibly Russia"
    },
    "history": {
      "ko": "초기 기원은 불확실하며 영국·북유럽에서 발전했어요.",
      "en": "Early origins are uncertain; developed in Britain and Scandinavia."
    },
    "sources": [
      "https://cfa.org/breed/russian-blue/"
    ],
    "certainty": "uncertain"
  },
  "siamese": {
    "flag": "🇹🇭",
    "region": {
      "ko": "태국",
      "en": "Thailand"
    },
    "history": {
      "ko": "옛 시암의 고양이 기록에 등장하는 전통 품종이에요.",
      "en": "A traditional cat described in old Siamese manuscripts."
    },
    "sources": [
      "https://tica.org/breed/siamese/"
    ],
    "certainty": "documented"
  },
  "ragdoll": {
    "flag": "🇺🇸",
    "region": {
      "ko": "미국",
      "en": "USA"
    },
    "history": {
      "ko": "1960년대 캘리포니아의 장모 집고양이에서 시작됐어요.",
      "en": "Developed in 1960s California from domestic longhairs."
    },
    "sources": [
      "https://cfa.org/breed/ragdoll/"
    ],
    "certainty": "documented"
  },
  "persian": {
    "flag": "🇮🇷",
    "region": {
      "ko": "옛 페르시아(이란) 연관",
      "en": "Linked to historic Persia (Iran)"
    },
    "history": {
      "ko": "초기 기원은 불확실하며 영국에서 품종화됐어요.",
      "en": "Early origins are uncertain; the modern breed developed in Britain."
    },
    "sources": [
      "https://tica.org/breed/persian/",
      "https://cfa.org/wp-content/uploads/2026/10/persian-highlights.pdf"
    ],
    "certainty": "uncertain"
  },
  "maine-coon": {
    "flag": "🇺🇸",
    "region": {
      "ko": "미국 메인주",
      "en": "Maine, USA"
    },
    "history": {
      "ko": "추운 뉴잉글랜드에 적응한 토착 장모묘에서 이어졌어요.",
      "en": "Descends from longhaired cats adapted to New England winters."
    },
    "sources": [
      "https://tica.org/breed/maine-coon/"
    ],
    "certainty": "documented"
  },
  "bengal": {
    "flag": "🇺🇸",
    "region": {
      "ko": "미국",
      "en": "USA"
    },
    "history": {
      "ko": "아시아표범고양이와 집고양이의 교배에서 시작됐어요.",
      "en": "Developed from Asian leopard cat and domestic cat crosses."
    },
    "sources": [
      "https://cfa.org/breed/bengal/",
      "https://tica.org/bengal-breed-history/"
    ],
    "certainty": "documented"
  },
  "abyssinian": {
    "flag": "🌍",
    "region": {
      "ko": "기원 논쟁·영국 정립",
      "en": "Origins debated; developed in Britain"
    },
    "history": {
      "ko": "아프리카 기원은 확정되지 않은 오래된 품종이에요.",
      "en": "An old breed whose supposed African origin is unconfirmed."
    },
    "sources": [
      "https://cfa.org/breed/abyssinian/",
      "https://www.gccfcats.org/wp-content/uploads/2025/01/Abyssinian.BreedingPolicy.2024.docx.pdf"
    ],
    "certainty": "uncertain"
  },
  "norwegian-forest": {
    "flag": "🇳🇴",
    "region": {
      "ko": "노르웨이",
      "en": "Norway"
    },
    "history": {
      "ko": "북유럽의 숲과 농장에서 살아온 토착 장모묘예요.",
      "en": "A native longhair shaped by life in Nordic forests and farms."
    },
    "sources": [
      "https://cfa.org/breed/norwegian-forest-cat/",
      "https://tica.org/breed/norwegian-forest/"
    ],
    "certainty": "documented"
  },
  "turkish-angora": {
    "flag": "🇹🇷",
    "region": {
      "ko": "튀르키예 앙카라",
      "en": "Ankara, Türkiye"
    },
    "history": {
      "ko": "앙카라 동물원의 보존 활동으로 이어진 장모 품종이에요.",
      "en": "A native longhair preserved through Ankara Zoo's breeding program."
    },
    "sources": [
      "https://tica.org/breed/turkish-angora/"
    ],
    "certainty": "documented"
  },
  "american-shorthair": {
    "flag": "🇺🇸",
    "region": {
      "ko": "미국",
      "en": "USA"
    },
    "history": {
      "ko": "이주민의 배에서 쥐를 잡던 단모묘가 바탕이 됐어요.",
      "en": "Descends from working cats brought aboard settlers' ships."
    },
    "sources": [
      "https://cfa.org/breed/american-shorthair/"
    ],
    "certainty": "documented"
  },
  "american-bobtail": {
    "flag": "🇺🇸",
    "region": {
      "ko": "미국",
      "en": "USA"
    },
    "history": {
      "ko": "1960년대 자연적으로 짧은 꼬리의 집고양이에서 시작됐어요.",
      "en": "Developed from naturally short-tailed domestic cats in the 1960s."
    },
    "sources": [
      "https://tica.org/breed/american-bobtail/"
    ],
    "certainty": "documented"
  },
  "american-curl": {
    "flag": "🇺🇸",
    "region": {
      "ko": "미국 캘리포니아",
      "en": "California, USA"
    },
    "history": {
      "ko": "1981년 발견된 뒤로 말린 귀의 고양이에서 시작됐어요.",
      "en": "Traces to a curled-ear stray found in 1981."
    },
    "sources": [
      "https://tica.org/breed/american-curl/"
    ],
    "certainty": "documented"
  },
  "american-wirehair": {
    "flag": "🇺🇸",
    "region": {
      "ko": "미국 뉴욕주",
      "en": "New York, USA"
    },
    "history": {
      "ko": "농장에서 태어난 곱슬곱슬한 털의 새끼가 시작이에요.",
      "en": "Began with a farm kitten born with a wiry coat mutation."
    },
    "sources": [
      "https://tica.org/breed/american-wirehair/"
    ],
    "certainty": "documented"
  },
  "australian-mist": {
    "flag": "🇦🇺",
    "region": {
      "ko": "호주",
      "en": "Australia"
    },
    "history": {
      "ko": "버미즈·아비시니안·집고양이를 교배해 만든 품종이에요.",
      "en": "Developed from Burmese, Abyssinian and domestic cats."
    },
    "sources": [
      "https://tica.org/breed/australian-mist/"
    ],
    "certainty": "documented"
  },
  "balinese": {
    "flag": "🇺🇸",
    "region": {
      "ko": "미국",
      "en": "USA"
    },
    "history": {
      "ko": "1950년대 샴에게서 태어난 장모묘를 품종화했어요.",
      "en": "Developed in the 1950s from longhaired Siamese kittens."
    },
    "sources": [
      "https://tica.org/breed/balinese/"
    ],
    "certainty": "documented"
  },
  "birman": {
    "flag": "🇫🇷",
    "region": {
      "ko": "프랑스에서 정립",
      "en": "Developed in France"
    },
    "history": {
      "ko": "미얀마 사원 전설이 있으나 초기 기원은 불확실해요.",
      "en": "Burmese temple stories are legend; early origins are uncertain."
    },
    "sources": [
      "https://tica.org/breed/birman/",
      "https://cfa.org/breed/birman/"
    ],
    "certainty": "uncertain"
  },
  "bombay": {
    "flag": "🇺🇸",
    "region": {
      "ko": "미국",
      "en": "USA"
    },
    "history": {
      "ko": "버미즈와 아메리칸 쇼트헤어로 검은 표범을 닮게 길렀어요.",
      "en": "Developed from Burmese and American Shorthairs for a panther look."
    },
    "sources": [
      "https://tica.org/breed/bombay/",
      "https://cfa.org/breed/bombay/"
    ],
    "certainty": "documented"
  },
  "british-longhair": {
    "flag": "🇬🇧",
    "region": {
      "ko": "영국",
      "en": "UK"
    },
    "history": {
      "ko": "브리티시 쇼트헤어와 페르시안의 교배에서 이어졌어요.",
      "en": "Its long coat traces to British Shorthair and Persian crosses."
    },
    "sources": [
      "https://tica.org/breed/british-longhair/",
      "https://tica.org/breed/british-shorthair/"
    ],
    "certainty": "documented"
  },
  "burmese": {
    "flag": "🇲🇲",
    "region": {
      "ko": "미얀마·미국",
      "en": "Myanmar; developed in the USA"
    },
    "history": {
      "ko": "1930년 미국에 온 웡 마우의 혈통을 바탕으로 정립됐어요.",
      "en": "Developed from Wong Mau, brought to the USA in 1930."
    },
    "sources": [
      "https://tica.org/breed/burmese/",
      "https://cfa.org/breed/burmese/"
    ],
    "certainty": "documented"
  },
  "burmilla": {
    "flag": "🇬🇧",
    "region": {
      "ko": "영국",
      "en": "UK"
    },
    "history": {
      "ko": "1981년 버미즈와 친칠라 페르시안의 우연한 교배로 탄생했어요.",
      "en": "Began with an accidental Burmese–Chinchilla Persian cross in 1981."
    },
    "sources": [
      "https://tica.org/breed/burmilla/",
      "https://cfa.org/wp-content/uploads/2024/06/burmilla-full-presentation.pdf"
    ],
    "certainty": "documented"
  },
  "chartreux": {
    "flag": "🇫🇷",
    "region": {
      "ko": "프랑스",
      "en": "France"
    },
    "history": {
      "ko": "수백 년 전 프랑스 기록에도 등장하는 푸른빛 고양이예요.",
      "en": "A blue-coated cat recorded in French history for centuries."
    },
    "sources": [
      "https://tica.org/breed/chartreux/"
    ],
    "certainty": "documented"
  },
  "chausie": {
    "flag": "🇺🇸",
    "region": {
      "ko": "미국",
      "en": "USA"
    },
    "history": {
      "ko": "정글고양이와 집고양이를 교배해 발전시킨 품종이에요.",
      "en": "Developed from jungle cat and domestic cat crosses."
    },
    "sources": [
      "https://tica.org/breed/chausie/",
      "https://loof.asso.fr/les-races-de-chat/chausie-nouvelle-race"
    ],
    "certainty": "documented"
  },
  "cherubim": {
    "flag": "🇺🇸",
    "region": {
      "ko": "미국",
      "en": "USA"
    },
    "history": {
      "ko": "랙돌 계통의 밍크·세피아·단색 고양이에서 구분됐어요.",
      "en": "Recognized from mink, sepia and solid Ragdoll lines."
    },
    "sources": [
      "https://links.tica.org/2024/Ragdoll/Ragdoll_Standard_Changes.pdf",
      "https://cfa.org/breed/ragdoll/",
      "https://tica.org/breed/cherubim/"
    ],
    "certainty": "documented"
  },
  "cornish-rex": {
    "flag": "🇬🇧",
    "region": {
      "ko": "영국 콘월",
      "en": "Cornwall, UK"
    },
    "history": {
      "ko": "1950년 태어난 곱슬털 새끼 칼리벙커에서 시작됐어요.",
      "en": "Descends from Kallibunker, a curly-coated kitten born in 1950."
    },
    "sources": [
      "https://tica.org/breed/cornish-rex/"
    ],
    "certainty": "documented"
  },
  "cymric": {
    "flag": "🇮🇲",
    "region": {
      "ko": "맨섬",
      "en": "Isle of Man"
    },
    "history": {
      "ko": "꼬리가 짧거나 없는 맹크스의 장모 계통이에요.",
      "en": "The longhaired form of the Manx island cat."
    },
    "sources": [
      "https://tica.org/breed/cymric/"
    ],
    "certainty": "documented"
  },
  "devon-rex": {
    "flag": "🇬🇧",
    "region": {
      "ko": "영국 데번",
      "en": "Devon, UK"
    },
    "history": {
      "ko": "곱슬털 고양이 컬리에서 시작된 독자적인 품종이에요.",
      "en": "Descends from Kirlee, carrying a distinct curly-coat mutation."
    },
    "sources": [
      "https://tica.org/breed/devon-rex/"
    ],
    "certainty": "documented"
  },
  "donskoy": {
    "flag": "🇷🇺",
    "region": {
      "ko": "러시아",
      "en": "Russia"
    },
    "history": {
      "ko": "1987년 로스토프나도누에서 구조된 고양이에서 시작됐어요.",
      "en": "Traces to a cat rescued in Rostov-on-Don in 1987."
    },
    "sources": [
      "https://tica.org/breed/donskoy/"
    ],
    "certainty": "documented"
  },
  "egyptian-mau": {
    "flag": "🇪🇬",
    "region": {
      "ko": "이집트·미국",
      "en": "Egypt; developed in the USA"
    },
    "history": {
      "ko": "이집트계 점박이 고양이가 1956년 미국에 전해졌어요.",
      "en": "Egyptian spotted cats reached the USA with their breeder in 1956."
    },
    "sources": [
      "https://cfa.org/breed/egyptian-mau/"
    ],
    "certainty": "documented"
  },
  "exotic-shorthair": {
    "flag": "🇺🇸",
    "region": {
      "ko": "미국",
      "en": "USA"
    },
    "history": {
      "ko": "페르시안과 단모묘의 교배로 짧고 풍성한 털을 얻었어요.",
      "en": "Developed by crossing Persians with shorthaired cats."
    },
    "sources": [
      "https://tica.org/breed/exotic-shorthair/",
      "https://cfa.org/breed/exotic/"
    ],
    "certainty": "documented"
  },
  "havana": {
    "flag": "🇬🇧",
    "region": {
      "ko": "영국·미국",
      "en": "UK and USA"
    },
    "history": {
      "ko": "1950년대 영국에서 갈색 고양이로 정립돼 미국에서 발전했어요.",
      "en": "Developed in 1950s Britain, then refined in the USA."
    },
    "sources": [
      "https://tica.org/breed/havana/"
    ],
    "certainty": "documented"
  },
  "highlander": {
    "flag": "🇺🇸",
    "region": {
      "ko": "미국",
      "en": "USA"
    },
    "history": {
      "ko": "2004년부터 야생 고양이를 닮은 집고양이로 길렀어요.",
      "en": "Developed from 2004 for a big-cat look using domestic cats."
    },
    "sources": [
      "https://tica.org/breed/highlander/",
      "https://tica.org/phocadownload/2007-annual_agenda.pdf"
    ],
    "certainty": "documented"
  },
  "himalayan": {
    "flag": "🇺🇸",
    "region": {
      "ko": "미국·영국",
      "en": "USA and UK"
    },
    "history": {
      "ko": "페르시안의 장모와 샴의 포인트 무늬를 결합했어요.",
      "en": "Developed by combining Persian longhair with Siamese points."
    },
    "sources": [
      "https://tica.org/breed/himalayan/",
      "https://cfa.org/persian-himalayan-article-1999/"
    ],
    "certainty": "documented"
  },
  "japanese-bobtail": {
    "flag": "🇯🇵",
    "region": {
      "ko": "일본",
      "en": "Japan"
    },
    "history": {
      "ko": "오래된 그림과 기록에 남아 있는 짧은 꼬리의 토착묘예요.",
      "en": "A native bobtailed cat depicted in old art and manuscripts."
    },
    "sources": [
      "https://tica.org/breed/japanese-bobtail/"
    ],
    "certainty": "documented"
  },
  "khaomanee": {
    "flag": "🇹🇭",
    "region": {
      "ko": "태국",
      "en": "Thailand"
    },
    "history": {
      "ko": "옛 태국 고양이 시집에도 등장하는 흰 고양이예요.",
      "en": "A white cat described in Thailand's old cat poems."
    },
    "sources": [
      "https://tica.org/breed/khaomanee/"
    ],
    "certainty": "documented"
  },
  "korat": {
    "flag": "🇹🇭",
    "region": {
      "ko": "태국",
      "en": "Thailand"
    },
    "history": {
      "ko": "옛 문헌에 기록되며 행운을 상징해 온 은청색 고양이예요.",
      "en": "An ancient silver-blue cat traditionally associated with good luck."
    },
    "sources": [
      "https://tica.org/breed/korat/"
    ],
    "certainty": "documented"
  },
  "kurilian-bobtail": {
    "flag": "🇷🇺",
    "region": {
      "ko": "쿠릴열도·사할린",
      "en": "Kuril Islands and Sakhalin"
    },
    "history": {
      "ko": "섬에서 자연적으로 이어진 짧은 꼬리의 고양이예요.",
      "en": "A naturally bobtailed island cat, later developed in Russia."
    },
    "sources": [
      "https://tica.org/breed/kurilian-bobtail/"
    ],
    "certainty": "documented"
  },
  "laperm": {
    "flag": "🇺🇸",
    "region": {
      "ko": "미국 오리건주",
      "en": "Oregon, USA"
    },
    "history": {
      "ko": "농장에서 태어난 곱슬털 고양이 컬리에서 시작됐어요.",
      "en": "Began with Curly, a farm cat with a natural coat mutation."
    },
    "sources": [
      "https://tica.org/breed/laperm/",
      "https://cfa.org/cat-talk/rare-and-unusual-breeds/"
    ],
    "certainty": "documented"
  },
  "lykoi": {
    "flag": "🇺🇸",
    "region": {
      "ko": "미국",
      "en": "USA"
    },
    "history": {
      "ko": "집고양이의 자연적인 털 변이에서 2011년 품종화가 시작됐어요.",
      "en": "Breed development began in 2011 from natural coat mutations."
    },
    "sources": [
      "https://tica.org/breed/lykoi/",
      "https://cfa.org/breed/lykoi/"
    ],
    "certainty": "documented"
  },
  "manx": {
    "region": {
      "ko": "맨섬",
      "en": "Isle of Man"
    },
    "history": {
      "ko": "섬의 고양이에게 생긴 짧은 꼬리 변이에서 이어졌어요.",
      "en": "Descended from island cats with a naturally shortened or absent tail."
    },
    "flag": "🇮🇲",
    "sources": [
      "https://www.gccfcats.org/getting-a-cat/choosing/cat-breeds/manx/"
    ],
    "certainty": "documented"
  },
  "minuet": {
    "region": {
      "ko": "미국",
      "en": "United States"
    },
    "history": {
      "ko": "먼치킨과 페르시안 계열을 교배해 탄생했어요.",
      "en": "Developed by crossing Munchkins with Persian-group cats."
    },
    "flag": "🇺🇸",
    "sources": [
      "https://tica.org/breed/minuet/"
    ],
    "certainty": "documented"
  },
  "munchkin": {
    "region": {
      "ko": "미국",
      "en": "United States"
    },
    "history": {
      "ko": "루이지애나에서 발견된 짧은 다리 고양이가 품종의 시작이에요.",
      "en": "The modern breed began with short-legged cats found in Louisiana."
    },
    "flag": "🇺🇸",
    "sources": [
      "https://tica.org/breed/munchkin/"
    ],
    "certainty": "documented"
  },
  "nebelung": {
    "region": {
      "ko": "미국",
      "en": "United States"
    },
    "history": {
      "ko": "덴버에서 태어난 청회색 장모 새끼들이 품종의 바탕이 됐어요.",
      "en": "Founded on blue longhaired kittens born in Denver in the 1980s."
    },
    "flag": "🇺🇸",
    "sources": [
      "https://www.gccfcats.org/getting-a-cat/choosing/cat-breeds/nebelung/"
    ],
    "certainty": "documented"
  },
  "ocicat": {
    "region": {
      "ko": "미국",
      "en": "United States"
    },
    "history": {
      "ko": "아비시니안과 샴 교배 중 태어난 점박이 새끼에서 시작됐어요.",
      "en": "Began with a spotted kitten from an Abyssinian–Siamese breeding."
    },
    "flag": "🇺🇸",
    "sources": [
      "https://cfa.org/breed/ocicat/",
      "https://loof.asso.fr/sites/default/download/05-en-standards-all-20150101.pdf"
    ],
    "certainty": "documented"
  },
  "oriental-longhair": {
    "region": {
      "ko": "영국",
      "en": "United Kingdom"
    },
    "history": {
      "ko": "샴을 바탕으로 여러 털색을 길러낸 오리엔탈의 장모형이에요.",
      "en": "The longhaired form of Orientals developed from Siamese-based crosses."
    },
    "flag": "🇬🇧",
    "sources": [
      "https://tica.org/breed/oriental-longhair/"
    ],
    "certainty": "documented"
  },
  "oriental-shorthair": {
    "region": {
      "ko": "영국",
      "en": "United Kingdom"
    },
    "history": {
      "ko": "샴과 여러 단모묘를 교배해 다양한 털색을 정립했어요.",
      "en": "Developed from Siamese crosses to establish a wide range of coat colours."
    },
    "flag": "🇬🇧",
    "sources": [
      "https://www.gccfcats.org/getting-a-cat/choosing/cat-breeds/oriental/"
    ],
    "certainty": "documented"
  },
  "peterbald": {
    "region": {
      "ko": "러시아",
      "en": "Russia"
    },
    "history": {
      "ko": "상트페테르부르크에서 돈스코이와 오리엔탈을 교배했어요.",
      "en": "Developed in St Petersburg from Donskoy and Oriental crosses."
    },
    "flag": "🇷🇺",
    "sources": [
      "https://tica.org/breed/peterbald/"
    ],
    "certainty": "documented"
  },
  "pixiebob": {
    "region": {
      "ko": "미국",
      "en": "United States"
    },
    "history": {
      "ko": "워싱턴주의 짧은 꼬리 집고양이들을 바탕으로 길렀어요.",
      "en": "Developed from bobtailed domestic cats in Washington State."
    },
    "flag": "🇺🇸",
    "sources": [
      "https://tica.org/wp-content/uploads/2018/08/TICA-Pixiebob-Breed-Introduction.pdf"
    ],
    "certainty": "documented"
  },
  "savannah": {
    "region": {
      "ko": "미국",
      "en": "United States"
    },
    "history": {
      "ko": "서벌과 집고양이의 교배에서 시작된 품종이에요.",
      "en": "Originated from crosses between an African serval and domestic cats."
    },
    "flag": "🇺🇸",
    "sources": [
      "https://www.savannahbreedsection.com/savannah-cat-history/",
      "https://tica.org/wp-content/uploads/2018/08/TICA-Savannah-Breed-Introduction.pdf"
    ],
    "certainty": "documented"
  },
  "scottish-fold": {
    "region": {
      "ko": "영국·스코틀랜드",
      "en": "Scotland, United Kingdom"
    },
    "history": {
      "ko": "접힌 귀를 가진 농장 고양이 수지에서 이어졌어요.",
      "en": "Traces back to Susie, a Scottish farm cat with folded ears."
    },
    "flag": "🇬🇧",
    "sources": [
      "https://tica.org/wp-content/uploads/2018/08/TICA-Scottish-Straight-Breed-Introduction.pdf"
    ],
    "certainty": "documented"
  },
  "scottish-straight": {
    "region": {
      "ko": "영국·스코틀랜드",
      "en": "Scotland, United Kingdom"
    },
    "history": {
      "ko": "스코티시 폴드와 같은 계통에서 태어나는 곧은 귀 유형이에요.",
      "en": "The upright-eared variety from the same Scottish lineage as the Fold."
    },
    "flag": "🇬🇧",
    "sources": [
      "https://tica.org/breed/scottish-straight/"
    ],
    "certainty": "documented"
  },
  "selkirk-rex": {
    "region": {
      "ko": "미국",
      "en": "United States"
    },
    "history": {
      "ko": "몬태나에서 태어난 곱슬털 새끼 고양이에서 시작됐어요.",
      "en": "Founded on a curly-coated kitten born in Montana."
    },
    "flag": "🇺🇸",
    "sources": [
      "https://tica.org/wp-content/uploads/2018/08/TICA-Selkirk-Rex-Breed-Introduction.pdf"
    ],
    "certainty": "documented"
  },
  "serengeti": {
    "region": {
      "ko": "미국",
      "en": "United States"
    },
    "history": {
      "ko": "캘리포니아에서 벵갈과 오리엔탈을 교배해 길렀어요.",
      "en": "Created in California from Bengal and Oriental Shorthair crosses."
    },
    "flag": "🇺🇸",
    "sources": [
      "https://tica.org/breed/serengeti/"
    ],
    "certainty": "documented"
  },
  "siberian": {
    "region": {
      "ko": "러시아",
      "en": "Russia"
    },
    "history": {
      "ko": "추운 지역의 토착 장모묘를 바탕으로 품종이 정립됐어요.",
      "en": "Standardised from Russia’s native longhaired cats adapted to a cold climate."
    },
    "flag": "🇷🇺",
    "sources": [
      "https://cfa.org/breed/siberian/",
      "https://tica.org/wp-content/uploads/2018/08/TICA-Siberian-Breed-Introduction.pdf"
    ],
    "certainty": "documented"
  },
  "singapura": {
    "region": {
      "ko": "싱가포르·미국",
      "en": "Singapore / United States"
    },
    "history": {
      "ko": "미국에서 품종화됐으며 초기 혈통에는 논쟁이 있어요.",
      "en": "Established in the United States, with disputed early ancestry linked to Singapore."
    },
    "flag": "🌍",
    "sources": [
      "https://www.gccfcats.org/getting-a-cat/choosing/cat-breeds/Singapura/",
      "https://www.gccfcats.org/wp-content/uploads/2021/10/Singapura.BP_.pdf"
    ],
    "certainty": "uncertain"
  },
  "snowshoe": {
    "region": {
      "ko": "미국",
      "en": "United States"
    },
    "history": {
      "ko": "필라델피아에서 흰 발을 가진 샴 새끼들을 바탕으로 길렀어요.",
      "en": "Developed in Philadelphia from Siamese kittens with white feet."
    },
    "flag": "🇺🇸",
    "sources": [
      "https://tica.org/breed/snowshoe/"
    ],
    "certainty": "documented"
  },
  "somali": {
    "region": {
      "ko": "미국·캐나다",
      "en": "United States / Canada"
    },
    "history": {
      "ko": "아비시니안의 장모 새끼들을 별도 품종으로 길렀어요.",
      "en": "Developed in North America from longhaired kittens born to Abyssinians."
    },
    "flag": "🇺🇸🇨🇦",
    "sources": [
      "https://www.gccfcats.org/getting-a-cat/choosing/cat-breeds/somali/"
    ],
    "certainty": "documented"
  },
  "sphynx": {
    "region": {
      "ko": "캐나다",
      "en": "Canada"
    },
    "history": {
      "ko": "캐나다의 무모묘에서 시작해 미국 계통도 더해졌어요.",
      "en": "Began with hairless cats in Canada, later joined by American foundation lines."
    },
    "flag": "🇨🇦",
    "sources": [
      "https://tica.org/breed/sphynx/"
    ],
    "certainty": "documented"
  },
  "tennessee-rex": {
    "region": {
      "ko": "미국",
      "en": "United States"
    },
    "history": {
      "ko": "테네시에서 자연 발생한 윤기 나는 곱슬털 변이에서 시작됐어요.",
      "en": "Originated from a spontaneous satin-and-curly coat mutation in Tennessee."
    },
    "flag": "🇺🇸",
    "sources": [
      "https://tica.org/wp-content/uploads/2024/12/AllBreedStandards.pdf"
    ],
    "certainty": "documented"
  },
  "thai": {
    "region": {
      "ko": "태국",
      "en": "Thailand"
    },
    "history": {
      "ko": "태국 토착 샴의 옛 체형을 보존하도록 이어온 품종이에요.",
      "en": "Preserves the traditional form of Thailand’s native pointed cats."
    },
    "flag": "🇹🇭",
    "sources": [
      "https://tica.org/breed/thai/"
    ],
    "certainty": "documented"
  },
  "tonkinese": {
    "region": {
      "ko": "캐나다·미국",
      "en": "Canada / United States"
    },
    "history": {
      "ko": "샴과 버미즈 계통을 바탕으로 북미에서 품종을 정립했어요.",
      "en": "Established in North America from Siamese and Burmese-related lines."
    },
    "flag": "🇨🇦🇺🇸",
    "sources": [
      "https://www.gccfcats.org/getting-a-cat/choosing/cat-breeds/tonkinese/"
    ],
    "certainty": "documented"
  },
  "toybob": {
    "region": {
      "ko": "러시아",
      "en": "Russia"
    },
    "history": {
      "ko": "로스토프나도누의 작고 짧은 꼬리 고양이들에서 이어졌어요.",
      "en": "Developed from small bobtailed cats found in Rostov-on-Don."
    },
    "flag": "🇷🇺",
    "sources": [
      "https://tica.org/phocadownload/2017-winter_agenda.pdf"
    ],
    "certainty": "documented"
  },
  "toyger": {
    "region": {
      "ko": "미국",
      "en": "United States"
    },
    "history": {
      "ko": "벵갈과 집고양이 계통으로 작은 호랑이 같은 무늬를 길렀어요.",
      "en": "Developed from Bengals and domestic cats to resemble a miniature tiger."
    },
    "flag": "🇺🇸",
    "sources": [
      "https://www.gccfcats.org/getting-a-cat/choosing/cat-breeds/toyger/"
    ],
    "certainty": "documented"
  },
  "turkish-van": {
    "region": {
      "ko": "튀르키예",
      "en": "Türkiye"
    },
    "history": {
      "ko": "현지 장모묘를 영국으로 데려가 품종으로 발전시켰어요.",
      "en": "Developed as a pedigree breed after Turkish longhaired cats were taken to Britain."
    },
    "flag": "🇹🇷",
    "sources": [
      "https://tica.org/breed/turkish-van/"
    ],
    "certainty": "documented"
  },
  "neva-masquerade": {
    "region": {
      "ko": "러시아",
      "en": "Russia"
    },
    "history": {
      "ko": "시베리안의 포인트 무늬 유형으로 네바강에서 이름을 땄어요.",
      "en": "The pointed Siberian variety, named after the Neva River."
    },
    "flag": "🇷🇺",
    "sources": [
      "https://www.gccfcats.org/wp-content/uploads/2024/01/SIBERIAN-BREEDING-POLICY-V4-4.1.24-based-on-V3-3.10.23.pdf"
    ],
    "certainty": "documented"
  },
  "european-shorthair": {
    "region": {
      "ko": "유럽",
      "en": "Europe"
    },
    "history": {
      "ko": "유럽의 전통적인 단모 집고양이를 바탕으로 정립됐어요.",
      "en": "Standardised from Europe’s traditional shorthaired domestic cats."
    },
    "flag": "🌍",
    "sources": [
      "https://loof.asso.fr/les-races-de-chat/european-shorthair",
      "https://fifeweb.org/cats/breeds/european/"
    ],
    "certainty": "documented"
  },
  "german-rex": {
    "region": {
      "ko": "독일",
      "en": "Germany"
    },
    "history": {
      "ko": "베를린 병원 정원에서 발견한 곱슬털 고양이에서 이어졌어요.",
      "en": "Descended from a curly-coated cat found in a Berlin hospital garden."
    },
    "flag": "🇩🇪",
    "sources": [
      "https://fifeweb.org/cats/breeds/german-rex/"
    ],
    "certainty": "documented"
  },
  "sokoke": {
    "region": {
      "ko": "케냐",
      "en": "Kenya"
    },
    "history": {
      "ko": "아라부코소코케 숲 지역의 고양이에서 발전한 품종이에요.",
      "en": "Developed from cats of Kenya’s Arabuko Sokoke forest region."
    },
    "flag": "🇰🇪",
    "sources": [
      "https://fifeweb.org/cats/breeds/sokoke/"
    ],
    "certainty": "documented"
  },
  "ragamuffin": {
    "region": {
      "ko": "미국",
      "en": "United States"
    },
    "history": {
      "ko": "랙돌 계통에서 갈라져 다양한 털색의 품종으로 발전했어요.",
      "en": "Developed from Ragdoll-related lines into a breed with varied colours."
    },
    "flag": "🇺🇸",
    "sources": [
      "https://cfa.org/breed/ragamuffin/",
      "https://www.gccfcats.org/getting-a-cat/choosing/cat-breeds/ragamuffin/"
    ],
    "certainty": "documented"
  },
  "anatoli": {
    "region": {
      "ko": "튀르키예",
      "en": "Türkiye"
    },
    "history": {
      "ko": "터키시 반과 닮은 체형의 단모 품종으로 구분됐어요.",
      "en": "Recognised as a shorthaired breed with a Turkish Van-like build."
    },
    "flag": "🇹🇷",
    "sources": [
      "https://crees.ku.edu/cats",
      "https://en.woc.center/articles/standards-ana/"
    ],
    "certainty": "documented"
  },
  "aphrodites-giant": {
    "region": {
      "ko": "키프로스",
      "en": "Cyprus"
    },
    "history": {
      "ko": "키프로스섬의 토착 고양이를 바탕으로 정립됐어요.",
      "en": "Established from the native cat population of Cyprus."
    },
    "flag": "🇨🇾",
    "sources": [
      "https://wcf.de/pdf-en/breed/APS_en.pdf",
      "https://tica.org/phocadownload/2015-winteragenda.pdf"
    ],
    "certainty": "documented"
  },
  "arabian-mau": {
    "region": {
      "ko": "아라비아반도",
      "en": "Arabian Peninsula"
    },
    "history": {
      "ko": "현지 토착묘를 아랍에미리트에서 품종으로 정립했어요.",
      "en": "Standardised in the UAE from the Arabian Peninsula’s native cats."
    },
    "flag": "🌍",
    "sources": [
      "https://www.khaleejtimes.com/uae/arabian-cat-gets-its-due-recognition?amp=1",
      "https://wcf.de/pdf-en/breed/ARM_en_2010-01-01.pdf"
    ],
    "certainty": "documented"
  },
  "asian": {
    "region": {
      "ko": "영국",
      "en": "United Kingdom"
    },
    "history": {
      "ko": "버미즈와 친칠라 페르시안 교배에서 다양한 유형이 나왔어요.",
      "en": "Developed from Burmese and Chinchilla Persian crosses into several varieties."
    },
    "flag": "🇬🇧",
    "sources": [
      "https://www.gccfcats.org/getting-a-cat/choosing/cat-breeds/asian/",
      "https://www.gccfcats.org/wp-content/uploads/2021/10/AsianBP.pdf"
    ],
    "certainty": "documented"
  },
  "brazilian-shorthair": {
    "region": {
      "ko": "브라질",
      "en": "Brazil"
    },
    "history": {
      "ko": "현지 길고양이들을 바탕으로 품종의 특징을 정립했어요.",
      "en": "Standardised from the cats living in Brazilian streets."
    },
    "flag": "🇧🇷",
    "sources": [
      "https://www.gatobras.com.br/racas-de-gatos/brazilian-shorthair",
      "https://wcf.de/pdf-en/breed/BSH_en.pdf"
    ],
    "certainty": "documented"
  },
  "ceylon": {
    "region": {
      "ko": "스리랑카",
      "en": "Sri Lanka"
    },
    "history": {
      "ko": "현지 토착묘를 이탈리아로 데려가 품종으로 길렀어요.",
      "en": "Developed in Italy from native cats imported from Sri Lanka."
    },
    "flag": "🇱🇰",
    "sources": [
      "https://loof.asso.fr/les-races-de-chat/ceylan",
      "https://en.woc.center/articles/standards-cey/"
    ],
    "certainty": "documented"
  },
  "kanaani": {
    "region": {
      "ko": "이스라엘",
      "en": "Israel"
    },
    "history": {
      "ko": "도리스 폴라체크가 현지 고양이들을 바탕으로 길렀어요.",
      "en": "Developed in Israel by Doris Pollatschek from local feline lines."
    },
    "flag": "🇮🇱",
    "sources": [
      "https://blogs.timesofisrael.com/doris-pollatschek-from-holocaust-memory-the-story-of-the-kanaani-cat-breed/",
      "https://twko.org/index.php/doris-pollatschek-kanaani-heritage-museum/"
    ],
    "certainty": "documented"
  },
  "karelian-bobtail": {
    "region": {
      "ko": "러시아",
      "en": "Russia"
    },
    "history": {
      "ko": "러시아 북서부에서 자연 발생한 짧은 꼬리 계통이에요.",
      "en": "A naturally bobtailed lineage from northwestern Russia."
    },
    "flag": "🇷🇺",
    "sources": [
      "https://en.woc.center/articles/standards-kal/",
      "https://wcf.de/pdf-en/breed/KAS_en_2010-01-01.pdf"
    ],
    "certainty": "documented"
  },
  "ural-rex": {
    "region": {
      "ko": "러시아",
      "en": "Russia"
    },
    "history": {
      "ko": "우랄 지역에서 태어난 곱슬털 고양이들을 바탕으로 길렀어요.",
      "en": "Developed from naturally curly-coated cats in the Ural region."
    },
    "flag": "🇷🇺",
    "sources": [
      "https://ural-rex-freunde.jimdofree.com/beschreibung/geschichte/"
    ],
    "certainty": "documented"
  },
  "german-longhair": {
    "region": {
      "ko": "독일",
      "en": "Germany"
    },
    "history": {
      "ko": "옛 독일 장모묘의 모습을 보존하며 품종을 다시 이어왔어요.",
      "en": "Revived to preserve the traditional form of Germany’s longhaired cats."
    },
    "flag": "🇩🇪",
    "sources": [
      "https://www.deutschlanghaarkatzen.de/dlh/geschichte2.html"
    ],
    "certainty": "documented"
  },
  "original-longhair": {
    "region": {
      "ko": "남아공에서 정립",
      "en": "Developed in South Africa"
    },
    "history": {
      "ko": "전통적인 페르시안형 장모를 보존한 계통",
      "en": "A preservation line of traditional Persian-type longhairs was formalized in South Africa."
    },
    "flag": "🇿🇦",
    "sources": [
      "https://www.casawcf.com/traditional-longhair.html"
    ],
    "certainty": "documented"
  },
  "york-chocolate": {
    "region": {
      "ko": "미국",
      "en": "United States"
    },
    "history": {
      "ko": "뉴욕에서 태어난 초콜릿빛 집고양이의 후손",
      "en": "Descended from a chocolate-colored domestic cat born in New York in 1983."
    },
    "flag": "🇺🇸",
    "sources": [
      "https://www.cca-afc.com/documents/BreedStandards/YORK_CHOCOLATE_20200203_021149.pdf"
    ],
    "certainty": "documented"
  },
  "mekong-bobtail": {
    "region": {
      "ko": "동남아시아·러시아",
      "en": "Southeast Asia and Russia"
    },
    "history": {
      "ko": "아시아의 짧은꼬리 고양이를 러시아에서 품종화",
      "en": "Asian bobtailed cats were developed into a defined breed in Russia."
    },
    "flag": "🇷🇺",
    "sources": [
      "https://afclubs.ru/history/H-MBT-1-6-.pdf"
    ],
    "certainty": "documented"
  },
  "suphalak": {
    "region": {
      "ko": "태국",
      "en": "Thailand"
    },
    "history": {
      "ko": "옛 태국 고양이 문헌에 등장하는 구릿빛 계통",
      "en": "A copper-brown Thai cat described in historic Thai cat literature."
    },
    "flag": "🇹🇭",
    "sources": [
      "https://thailand.go.th/public/issue-focus-detail/-2855?hl=en"
    ],
    "certainty": "documented"
  },
  "aztek": {
    "region": {
      "ko": "영국에서 정립",
      "en": "Developed in the United Kingdom"
    },
    "history": {
      "ko": "미국 오시캣의 소용돌이 무늬형, 일명 클래식",
      "en": "The classic-tabby form of the American Ocicat was developed in Britain under the former name Aztec."
    },
    "flag": "🇬🇧",
    "sources": [
      "https://www.gccfcats.org/wp-content/uploads/2021/10/OcicatAztecBP.pdf",
      "https://ocicat-classics.club/"
    ],
    "certainty": "documented"
  },
  "transylvanian": {
    "region": {
      "ko": "루마니아",
      "en": "Romania"
    },
    "history": {
      "ko": "현지의 카르파티 무늬 집고양이에서 정립",
      "en": "Developed from naturally occurring Romanian cats with the Carpati coat pattern."
    },
    "flag": "🇷🇴",
    "sources": [
      "https://transylvanian.cat/faq/"
    ],
    "certainty": "documented"
  },
  "konja": {
    "region": {
      "ko": "태국",
      "en": "Thailand"
    },
    "history": {
      "ko": "태국의 옛 고양이 시집에 기록된 검은 고양이",
      "en": "A native black Thai cat described in the historic Tamra Maew cat poems."
    },
    "flag": "🇹🇭",
    "sources": [
      "https://fffcat.com/upfiles/202309/18/1695040529_75r.pdf",
      "https://thailand.go.th/public/issue-focus-detail/-2855?hl=en"
    ],
    "certainty": "documented"
  },
  "colorpoint-shorthair": {
    "region": {
      "ko": "미국·영국",
      "en": "United States and United Kingdom"
    },
    "history": {
      "ko": "샴의 포인트 색을 다양하게 넓힌 계통",
      "en": "Developed from Siamese to introduce additional point colors through American and British breeding programs."
    },
    "flag": "🇺🇸🇬🇧",
    "sources": [
      "https://cfa.org/breed/colorpoint-shorthair/"
    ],
    "certainty": "documented"
  },
  "foreign-white-shorthair": {
    "region": {
      "ko": "영국",
      "en": "United Kingdom"
    },
    "history": {
      "ko": "샴과 흰 단모 고양이의 교배에서 시작",
      "en": "Developed in Britain by crossing Siamese with dominant-white British shorthairs."
    },
    "flag": "🇬🇧",
    "sources": [
      "https://www.nzcf.com/downloads/Issue%2047.pdf"
    ],
    "certainty": "documented"
  },
  "foreign-white-longhair": {
    "region": {
      "ko": "기원 미확인",
      "en": "Origin not established"
    },
    "history": {
      "ko": "흰 발리니즈형 장모로 호주에서 기준 정립",
      "en": "A white Balinese-type longhair whose standard was established by the Australian Cat Federation."
    },
    "flag": "🌍",
    "sources": [
      "https://www.acf.asn.au/notices/notices/standards/2018StandardsAdmin.pdf",
      "https://www.fccvic.org/foreign-white"
    ],
    "certainty": "uncertain"
  },
  "european-burmese": {
    "region": {
      "ko": "영국에서 발전",
      "en": "Developed in the United Kingdom"
    },
    "history": {
      "ko": "미국에서 온 버미즈를 바탕으로 발전한 계통",
      "en": "Developed in Britain from Burmese imported from the United States."
    },
    "flag": "🇬🇧",
    "sources": [
      "https://cfa.org/breed/european-burmese/"
    ],
    "certainty": "documented"
  },
  "suffolk": {
    "region": {
      "ko": "영국",
      "en": "United Kingdom"
    },
    "history": {
      "ko": "초기의 하바나 체형을 보존하려 정립한 품종",
      "en": "Developed in Britain to preserve the original Havana type."
    },
    "flag": "🇬🇧",
    "sources": [
      "https://www.gccfcats.org/getting-a-cat/choosing/cat-breeds/suffolk/"
    ],
    "certainty": "documented"
  },
  "thai-lilac": {
    "region": {
      "ko": "태국 계통·영국 정립",
      "en": "Thai ancestry; developed in Britain"
    },
    "history": {
      "ko": "코랏에서 태어난 연보랏빛 계통",
      "en": "Developed in Britain from lilac kittens born to Thai-descended Korats."
    },
    "flag": "🇹🇭🇬🇧",
    "sources": [
      "https://www.gccfcats.org/getting-a-cat/choosing/cat-breeds/thai/"
    ],
    "certainty": "documented"
  },
  "thai-blue-point": {
    "region": {
      "ko": "태국 계통·영국 정립",
      "en": "Thai ancestry; developed in Britain"
    },
    "history": {
      "ko": "코랏에서 태어난 푸른 포인트 계통",
      "en": "Developed in Britain from blue-point kittens born to Thai-descended Korats."
    },
    "flag": "🇹🇭🇬🇧",
    "sources": [
      "https://www.gccfcats.org/getting-a-cat/choosing/cat-breeds/thai/"
    ],
    "certainty": "documented"
  },
  "thai-lilac-point": {
    "region": {
      "ko": "태국 계통·영국 정립",
      "en": "Thai ancestry; developed in Britain"
    },
    "history": {
      "ko": "코랏에서 태어난 연보라 포인트 계통",
      "en": "A lilac-point variety of the Thai-descended Korat lines developed in Britain."
    },
    "flag": "🇹🇭🇬🇧",
    "sources": [
      "https://www.gccfcats.org/getting-a-cat/choosing/cat-breeds/thai/"
    ],
    "certainty": "documented"
  },
  "chinchilla-longhair": {
    "region": {
      "ko": "남아공에서 정립",
      "en": "Formalized in South Africa"
    },
    "history": {
      "ko": "친칠라 페르시안 계통을 별도 품종으로 구분",
      "en": "The Chinchilla Persian lineage is recognized as a separate longhair breed in South Africa."
    },
    "flag": "🇿🇦",
    "sources": [
      "https://www.worldcatcongress.org/wp/cat_breed_comp_chl.php",
      "https://www.tsacc.org.za/accepted-breeds",
      "https://www.casawcf.com/traditional-longhair.html"
    ],
    "certainty": "documented"
  },
  "burmese-longhair": {
    "region": {
      "ko": "기원 미확인",
      "en": "Origin not established"
    },
    "history": {
      "ko": "버미즈·만달레이에서 이어진 장모 계통",
      "en": "The Tiffany standard describes a longhaired derivative of Burmese and Mandalay cats."
    },
    "flag": "🌍",
    "sources": [
      "https://nzcf.com/file_downloads/sop/SH-00-ALL-2026.pdf"
    ],
    "certainty": "uncertain"
  },
  "cornish-rex-longhair": {
    "region": {
      "ko": "기원 미확인",
      "en": "Origin not established"
    },
    "history": {
      "ko": "코니시 렉스 계통의 긴 곱슬털 변이",
      "en": "A longhaired Cornish Rex type also known as the Californian Rex."
    },
    "flag": "🌍",
    "sources": [
      "https://loof.asso.fr/sites/default/download/05-en-standards-all-20230101.pdf"
    ],
    "certainty": "uncertain"
  },
  "asian-longhair": {
    "region": {
      "ko": "영국",
      "en": "United Kingdom"
    },
    "history": {
      "ko": "버미즈와 친칠라 교배에서 이어진 장모 계통",
      "en": "A longhaired Asian variety descended from Burmese and Chinchilla Persian crosses in Britain."
    },
    "flag": "🇬🇧",
    "sources": [
      "https://www.gccfcats.org/wp-content/uploads/2021/10/AsianBP.pdf"
    ],
    "certainty": "documented"
  },
  "turkish-vankedisi": {
    "region": {
      "ko": "튀르키예",
      "en": "Türkiye"
    },
    "history": {
      "ko": "반 호수 일대에서 유래한 순백색 장모 계통",
      "en": "A solid-white longhair originating around Lake Van in eastern Türkiye."
    },
    "flag": "🇹🇷",
    "sources": [
      "https://www.gccfcats.org/wp-content/uploads/2021/10/Reg.Pol_.TurkishVan.pdf"
    ],
    "certainty": "documented"
  },
  "russian-white": {
    "region": {
      "ko": "영국·호주",
      "en": "United Kingdom and Australia"
    },
    "history": {
      "ko": "러시안 블루와 흰 고양이에서 정립한 계통",
      "en": "Developed through British and Australian programs crossing white cats with Russian Blues."
    },
    "flag": "🇬🇧🇦🇺",
    "sources": [
      "https://russiancatsaustralia.com/black-white/"
    ],
    "certainty": "documented"
  },
  "russian-black": {
    "region": {
      "ko": "영국·호주",
      "en": "United Kingdom and Australia"
    },
    "history": {
      "ko": "러시안의 흰색 계통 번식 중 이어진 검은색형",
      "en": "A black variety maintained within British and Australian Russian breeding lines."
    },
    "flag": "🇬🇧🇦🇺",
    "sources": [
      "https://russiancatsaustralia.com/black-white/"
    ],
    "certainty": "documented"
  },
  "ocicat-classic": {
    "region": {
      "ko": "영국에서 정립",
      "en": "Developed in the United Kingdom"
    },
    "history": {
      "ko": "미국 오시캣의 소용돌이 무늬형, 옛 이름 아즈텍",
      "en": "The classic-tabby form of the American Ocicat was developed in Britain and formerly called Aztec."
    },
    "flag": "🇬🇧",
    "sources": [
      "https://www.gccfcats.org/wp-content/uploads/2021/10/OcicatAztecBP.pdf",
      "https://ocicat-classics.club/"
    ],
    "certainty": "documented"
  },
  "domestic-longhair": {
    "region": {
      "ko": "전 세계",
      "en": "Worldwide"
    },
    "history": {
      "ko": "긴 털의 집고양이 분류로 특정 원산지 없음",
      "en": "A longhaired household-cat category without a single breed origin."
    },
    "flag": "🌍",
    "sources": [
      "https://cfa.org/showing-a-household-pet/",
      "https://www.gccfcats.org/wp-content/uploads/2025/09/GEMS-code-list-Sept25.pdf"
    ],
    "certainty": "documented"
  },
  "domestic-mediumhair": {
    "region": {
      "ko": "전 세계",
      "en": "Worldwide"
    },
    "history": {
      "ko": "중간 길이 털의 집고양이 분류",
      "en": "A household-cat category defined by medium-length fur."
    },
    "flag": "🌍",
    "sources": [
      "https://cfa.org/showing-a-household-pet/",
      "https://www.gccfcats.org/wp-content/uploads/2025/09/GEMS-code-list-Sept25.pdf"
    ],
    "certainty": "documented"
  },
  "domestic-black": {
    "region": {
      "ko": "전 세계",
      "en": "Worldwide"
    },
    "history": {
      "ko": "검은 털로 구분한 집고양이 유형",
      "en": "A household-cat color category for solid black coats."
    },
    "flag": "🌍",
    "sources": [
      "https://cfa.org/coat-color-descriptions/",
      "https://cfa.org/showing-a-household-pet/"
    ],
    "certainty": "documented"
  },
  "domestic-tuxedo": {
    "region": {
      "ko": "전 세계",
      "en": "Worldwide"
    },
    "history": {
      "ko": "검정·흰색 털 배치를 가리키는 무늬 유형",
      "en": "A black-and-white household-cat pattern category."
    },
    "flag": "🌍",
    "sources": [
      "https://tica.org/what-color-is-my-cat/",
      "https://cfa.org/coat-color-descriptions/"
    ],
    "certainty": "documented"
  },
  "domestic-calico": {
    "region": {
      "ko": "전 세계",
      "en": "Worldwide"
    },
    "history": {
      "ko": "흰 바탕에 검정·주황 얼룩이 있는 털색 유형",
      "en": "A coat-pattern category combining white, black and orange patches."
    },
    "flag": "🌍",
    "sources": [
      "https://tica.org/what-color-is-my-cat/",
      "https://cfa.org/coat-color-descriptions/"
    ],
    "certainty": "documented"
  },
  "domestic-tortoiseshell": {
    "region": {
      "ko": "전 세계",
      "en": "Worldwide"
    },
    "history": {
      "ko": "검정과 주황이 섞인 카오스 털색 유형",
      "en": "A coat-color category with mingled black and orange."
    },
    "flag": "🌍",
    "sources": [
      "https://cfa.org/coat-color-descriptions/",
      "https://tica.org/what-color-is-my-cat/"
    ],
    "certainty": "documented"
  },
  "domestic-orange-tabby": {
    "region": {
      "ko": "전 세계",
      "en": "Worldwide"
    },
    "history": {
      "ko": "주황색 털에 태비 무늬가 있는 유형",
      "en": "An orange-coated household cat with tabby markings."
    },
    "flag": "🌍",
    "sources": [
      "https://cfa.org/coat-color-descriptions/",
      "https://tica.org/what-color-is-my-cat/"
    ],
    "certainty": "documented"
  },
  "domestic-brown-tabby": {
    "region": {
      "ko": "전 세계",
      "en": "Worldwide"
    },
    "history": {
      "ko": "갈색 바탕에 짙은 태비 무늬가 있는 유형",
      "en": "A brown-ground household-cat category with darker tabby markings."
    },
    "flag": "🌍",
    "sources": [
      "https://tica.org/what-color-is-my-cat/"
    ],
    "certainty": "documented"
  },
  "domestic-white": {
    "region": {
      "ko": "전 세계",
      "en": "Worldwide"
    },
    "history": {
      "ko": "흰 털로 구분한 집고양이 유형",
      "en": "A household-cat color category for solid white coats."
    },
    "flag": "🌍",
    "sources": [
      "https://cfa.org/coat-color-descriptions/",
      "https://cfa.org/showing-a-household-pet/"
    ],
    "certainty": "documented"
  },
  "domestic-bicolor": {
    "region": {
      "ko": "전 세계",
      "en": "Worldwide"
    },
    "history": {
      "ko": "흰색과 다른 색이 함께 있는 털색 유형",
      "en": "A household-cat pattern combining white with another coat color."
    },
    "flag": "🌍",
    "sources": [
      "https://cfa.org/coat-color-descriptions/"
    ],
    "certainty": "documented"
  },
  "domestic-silver-tabby": {
    "region": {
      "ko": "전 세계",
      "en": "Worldwide"
    },
    "history": {
      "ko": "은빛 바탕에 태비 무늬가 있는 유형",
      "en": "A household-cat category with tabby markings on a silver ground."
    },
    "flag": "🌍",
    "sources": [
      "https://tica.org/what-color-is-my-cat/"
    ],
    "certainty": "documented"
  },
  "domestic-spotted-tabby": {
    "region": {
      "ko": "전 세계",
      "en": "Worldwide"
    },
    "history": {
      "ko": "몸의 점무늬로 구분하는 태비 유형",
      "en": "A household-cat tabby pattern distinguished by spots."
    },
    "flag": "🌍",
    "sources": [
      "https://tica.org/what-color-is-my-cat/",
      "https://cfa.org/coat-color-descriptions/"
    ],
    "certainty": "documented"
  },
  "domestic-classic-tabby": {
    "region": {
      "ko": "전 세계",
      "en": "Worldwide"
    },
    "history": {
      "ko": "몸 옆 소용돌이 무늬로 구분하는 태비 유형",
      "en": "A household-cat tabby pattern with broad swirling side markings."
    },
    "flag": "🌍",
    "sources": [
      "https://cfa.org/coat-color-descriptions/"
    ],
    "certainty": "documented"
  },
  "domestic-mackerel-tabby": {
    "region": {
      "ko": "전 세계",
      "en": "Worldwide"
    },
    "history": {
      "ko": "가늘고 나란한 줄무늬로 구분하는 태비 유형",
      "en": "A household-cat tabby pattern of narrow parallel stripes."
    },
    "flag": "🌍",
    "sources": [
      "https://cfa.org/coat-color-descriptions/"
    ],
    "certainty": "documented"
  },
  "domestic-ticked-tabby": {
    "region": {
      "ko": "전 세계",
      "en": "Worldwide"
    },
    "history": {
      "ko": "털 한 올의 색 띠가 두드러지는 태비 유형",
      "en": "A tabby category distinguished by alternating color bands on individual hairs."
    },
    "flag": "🌍",
    "sources": [
      "https://tica.org/what-color-is-my-cat/",
      "https://cfa.org/coat-color-descriptions/"
    ],
    "certainty": "documented"
  },
  "domestic-colorpoint": {
    "region": {
      "ko": "전 세계",
      "en": "Worldwide"
    },
    "history": {
      "ko": "얼굴·귀·다리·꼬리 색이 짙은 털색 유형",
      "en": "A household-cat pattern with darker face, ears, legs and tail."
    },
    "flag": "🌍",
    "sources": [
      "https://tica.org/what-color-is-my-cat/"
    ],
    "certainty": "documented"
  },
  "domestic-dilute-calico": {
    "region": {
      "ko": "전 세계",
      "en": "Worldwide"
    },
    "history": {
      "ko": "삼색 무늬가 회청색·크림색으로 옅어진 유형",
      "en": "A dilute calico pattern combining white, blue-gray and cream."
    },
    "flag": "🌍",
    "sources": [
      "https://tica.org/what-color-is-my-cat/"
    ],
    "certainty": "documented"
  }
});

/** Accepts existing MEOW base and variant IDs without changing profile data. */
export function getCompanionOrigin(catId, locale = 'ko') {
  const entry = companionOrigins[getCompanion(catId)?.id];
  if (!entry) return null;
  const language = locale === 'en' ? 'en' : 'ko';
  return { flag: entry.flag, region: entry.region[language], history: entry.history[language], sources: entry.sources };
}
