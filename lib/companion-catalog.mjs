/** MEOW와 동일한 고양이 목록·순서 및 2026-11-11 투명 얼굴 자산. 서버/API 호출 없음. */
export const catCatalogueCheckedAt = "2026-11-10";
export const catSources = Object.freeze({
  "tica": {
    "name": "TICA",
    "url": "https://tica.org/ticas-breeds/browse-all-breeds/"
  },
  "wcf": {
    "name": "WCF EMS",
    "url": "https://wcf.de/pdf-en/WCF-EMS_EN.pdf"
  },
  "fife": {
    "name": "FIFe",
    "url": "https://fifeweb.org/cats/breeds/"
  },
  "gccf": {
    "name": "GCCF",
    "url": "https://www.gccfcats.org/getting-a-cat/choosing/cat-breeds/"
  },
  "companion": {
    "name": "집고양이 유형",
    "url": "https://tica.org/ticas-breeds/browse-all-breeds/"
  }
});
export const COAT_LABELS = Object.freeze({"short":"단모","long":"장모","curly":"곱슬털","hairless":"무모·부분 무모","house":"집고양이"});
export const MBTI_TYPES = Object.freeze(["INTJ","INTP","ENTJ","ENTP","INFJ","INFP","ENFJ","ENFP","ISTJ","ISFJ","ESTJ","ESFJ","ISTP","ISFP","ESTP","ESFP"]);
export const catBreeds = Object.freeze([
  {"id":"domestic-shorthair","en":"Domestic Shorthair","ko":"단모 집고양이","coat":"house","source":"companion","aliases":["코숏","코리안 쇼트헤어","코리안숏헤어","믹스","Household Cat","Household Pet Shorthair"],"sheet":"core","cell":0},
  {"id":"british-shorthair","en":"British Shorthair","ko":"브리티시 쇼트헤어","coat":"short","source":"tica","aliases":[],"sheet":"core","cell":1},
  {"id":"russian-blue","en":"Russian Blue","ko":"러시안 블루","coat":"short","source":"tica","aliases":[],"sheet":"core","cell":2},
  {"id":"siamese","en":"Siamese","ko":"샴","coat":"short","source":"tica","aliases":["시암"],"sheet":"core","cell":3},
  {"id":"ragdoll","en":"Ragdoll","ko":"랙돌","coat":"long","source":"tica","aliases":[],"sheet":"core","cell":4},
  {"id":"persian","en":"Persian","ko":"페르시안","coat":"long","source":"tica","aliases":[],"sheet":"core","cell":5},
  {"id":"maine-coon","en":"Maine Coon","ko":"메인쿤","coat":"long","source":"tica","aliases":[],"sheet":"core","cell":6},
  {"id":"bengal","en":"Bengal","ko":"벵갈","coat":"short","source":"tica","aliases":[],"sheet":"core","cell":7},
  {"id":"abyssinian","en":"Abyssinian","ko":"아비시니안","coat":"short","source":"tica","aliases":[],"sheet":"core","cell":8},
  {"id":"norwegian-forest","en":"Norwegian Forest","ko":"노르웨이 숲","coat":"long","source":"tica","aliases":["Norwegian Forest Cat"],"sheet":"core","cell":9},
  {"id":"turkish-angora","en":"Turkish Angora","ko":"터키시 앙고라","coat":"long","source":"tica","aliases":[],"sheet":"core","cell":10},
  {"id":"american-shorthair","en":"American Shorthair","ko":"아메리칸 쇼트헤어","coat":"short","source":"tica","aliases":[],"sheet":"core","cell":11},
  {"id":"american-bobtail","en":"American Bobtail","ko":"아메리칸 밥테일","coat":"long","source":"tica","aliases":[],"sheet":"a","cell":0},
  {"id":"american-curl","en":"American Curl","ko":"아메리칸 컬","coat":"short","source":"tica","aliases":["American Curl Shorthair"],"sheet":"a","cell":1},
  {"id":"american-wirehair","en":"American Wirehair","ko":"아메리칸 와이어헤어","coat":"curly","source":"tica","aliases":[],"sheet":"a","cell":2},
  {"id":"australian-mist","en":"Australian Mist","ko":"오스트레일리안 미스트","coat":"short","source":"tica","aliases":[],"sheet":"a","cell":3},
  {"id":"balinese","en":"Balinese","ko":"발리니즈","coat":"long","source":"tica","aliases":["발리네즈","Javanese","Siamese Longhair"],"sheet":"a","cell":4},
  {"id":"birman","en":"Birman","ko":"버만","coat":"long","source":"tica","aliases":["Sacred Birman","버먼"],"sheet":"a","cell":5},
  {"id":"bombay","en":"Bombay","ko":"봄베이","coat":"short","source":"tica","aliases":[],"sheet":"a","cell":6},
  {"id":"british-longhair","en":"British Longhair","ko":"브리티시 롱헤어","coat":"long","source":"tica","aliases":[],"sheet":"a","cell":7},
  {"id":"burmese","en":"Burmese","ko":"버미즈","coat":"short","source":"tica","aliases":["American Burmese","Burmese American"],"sheet":"a","cell":8},
  {"id":"burmilla","en":"Burmilla","ko":"버밀라","coat":"short","source":"tica","aliases":[],"sheet":"a","cell":9},
  {"id":"chartreux","en":"Chartreux","ko":"샤르트뢰","coat":"short","source":"tica","aliases":[],"sheet":"a","cell":10},
  {"id":"chausie","en":"Chausie","ko":"쵸시","coat":"short","source":"tica","aliases":["차우시"],"sheet":"a","cell":11},
  {"id":"cherubim","en":"Cherubim","ko":"체루빔","coat":"long","source":"tica","aliases":[],"sheet":"a","cell":12},
  {"id":"cornish-rex","en":"Cornish Rex","ko":"코니시 렉스","coat":"curly","source":"tica","aliases":[],"sheet":"a","cell":13},
  {"id":"cymric","en":"Cymric","ko":"킴릭","coat":"long","source":"tica","aliases":[],"sheet":"a","cell":14},
  {"id":"devon-rex","en":"Devon Rex","ko":"데본 렉스","coat":"curly","source":"tica","aliases":[],"sheet":"a","cell":15},
  {"id":"donskoy","en":"Donskoy","ko":"돈스코이","coat":"hairless","source":"tica","aliases":["Don Sphynx","돈 스핑크스"],"sheet":"a","cell":16},
  {"id":"egyptian-mau","en":"Egyptian Mau","ko":"이집션 마우","coat":"short","source":"tica","aliases":[],"sheet":"a","cell":17},
  {"id":"exotic-shorthair","en":"Exotic Shorthair","ko":"엑조틱 쇼트헤어","coat":"short","source":"tica","aliases":["Exotic"],"sheet":"a","cell":18},
  {"id":"havana","en":"Havana","ko":"하바나","coat":"short","source":"tica","aliases":["Havana Brown","하바나 브라운"],"sheet":"a","cell":19},
  {"id":"highlander","en":"Highlander","ko":"하이랜더","coat":"long","source":"tica","aliases":[],"sheet":"a","cell":20},
  {"id":"himalayan","en":"Himalayan","ko":"히말라얀","coat":"long","source":"tica","aliases":["Colourpoint Himalayan"],"sheet":"a","cell":21},
  {"id":"japanese-bobtail","en":"Japanese Bobtail","ko":"재패니즈 밥테일","coat":"short","source":"tica","aliases":[],"sheet":"a","cell":22},
  {"id":"khaomanee","en":"Khaomanee","ko":"카오마니","coat":"short","source":"tica","aliases":["Khao Manee"],"sheet":"a","cell":23},
  {"id":"korat","en":"Korat","ko":"코랏","coat":"short","source":"tica","aliases":[],"sheet":"a","cell":24},
  {"id":"kurilian-bobtail","en":"Kurilian Bobtail","ko":"쿠릴리안 밥테일","coat":"short","source":"tica","aliases":["Kurilean Bobtail"],"sheet":"a","cell":25},
  {"id":"laperm","en":"LaPerm","ko":"라펌","coat":"curly","source":"tica","aliases":["La Perm","LaPerm Longhair"],"sheet":"a","cell":26},
  {"id":"lykoi","en":"Lykoi","ko":"라이코이","coat":"hairless","source":"tica","aliases":[],"sheet":"a","cell":27},
  {"id":"manx","en":"Manx","ko":"맹크스","coat":"short","source":"tica","aliases":[],"sheet":"a","cell":28},
  {"id":"minuet","en":"Minuet","ko":"미뉴에트","coat":"short","source":"tica","aliases":["Napoleon","나폴레옹"],"sheet":"a","cell":29},
  {"id":"munchkin","en":"Munchkin","ko":"먼치킨","coat":"short","source":"tica","aliases":[],"sheet":"a","cell":30},
  {"id":"nebelung","en":"Nebelung","ko":"네벨룽","coat":"long","source":"tica","aliases":["Russian Blue Longhair"],"sheet":"a","cell":31},
  {"id":"ocicat","en":"Ocicat","ko":"오시캣","coat":"short","source":"tica","aliases":[],"sheet":"a","cell":32},
  {"id":"oriental-longhair","en":"Oriental Longhair","ko":"오리엔탈 롱헤어","coat":"long","source":"tica","aliases":["Mandarin"],"sheet":"a","cell":33},
  {"id":"oriental-shorthair","en":"Oriental Shorthair","ko":"오리엔탈 쇼트헤어","coat":"short","source":"tica","aliases":[],"sheet":"a","cell":34},
  {"id":"peterbald","en":"Peterbald","ko":"피터볼드","coat":"hairless","source":"tica","aliases":[],"sheet":"a","cell":35},
  {"id":"pixiebob","en":"Pixiebob","ko":"픽시밥","coat":"short","source":"tica","aliases":[],"sheet":"b","cell":0},
  {"id":"savannah","en":"Savannah","ko":"사바나","coat":"short","source":"tica","aliases":[],"sheet":"b","cell":1},
  {"id":"scottish-fold","en":"Scottish Fold","ko":"스코티시 폴드","coat":"short","source":"tica","aliases":[],"sheet":"b","cell":2},
  {"id":"scottish-straight","en":"Scottish Straight","ko":"스코티시 스트레이트","coat":"short","source":"tica","aliases":[],"sheet":"b","cell":3},
  {"id":"selkirk-rex","en":"Selkirk Rex","ko":"셀커크 렉스","coat":"curly","source":"tica","aliases":[],"sheet":"b","cell":4},
  {"id":"serengeti","en":"Serengeti","ko":"세렝게티","coat":"short","source":"tica","aliases":[],"sheet":"b","cell":5},
  {"id":"siberian","en":"Siberian","ko":"시베리안","coat":"long","source":"tica","aliases":[],"sheet":"b","cell":6},
  {"id":"singapura","en":"Singapura","ko":"싱가푸라","coat":"short","source":"tica","aliases":[],"sheet":"b","cell":7},
  {"id":"snowshoe","en":"Snowshoe","ko":"스노슈","coat":"short","source":"tica","aliases":[],"sheet":"b","cell":8},
  {"id":"somali","en":"Somali","ko":"소말리","coat":"long","source":"tica","aliases":[],"sheet":"b","cell":9},
  {"id":"sphynx","en":"Sphynx","ko":"스핑크스","coat":"hairless","source":"tica","aliases":["Canadian Sphynx"],"sheet":"b","cell":10},
  {"id":"tennessee-rex","en":"Tennessee Rex","ko":"테네시 렉스","coat":"curly","source":"tica","aliases":[],"sheet":"b","cell":11},
  {"id":"thai","en":"Thai","ko":"타이","coat":"short","source":"tica","aliases":["Wichien Maat","위치엔 마트"],"sheet":"b","cell":12},
  {"id":"tonkinese","en":"Tonkinese","ko":"통키니즈","coat":"short","source":"tica","aliases":[],"sheet":"b","cell":13},
  {"id":"toybob","en":"Toybob","ko":"토이밥","coat":"short","source":"tica","aliases":[],"sheet":"b","cell":14},
  {"id":"toyger","en":"Toyger","ko":"토이거","coat":"short","source":"tica","aliases":[],"sheet":"b","cell":15},
  {"id":"turkish-van","en":"Turkish Van","ko":"터키시 반","coat":"long","source":"tica","aliases":[],"sheet":"b","cell":16},
  {"id":"neva-masquerade","en":"Neva Masquerade","ko":"네바 마스커레이드","coat":"long","source":"fife","aliases":[],"sheet":"b","cell":17},
  {"id":"european-shorthair","en":"European Shorthair","ko":"유러피안 쇼트헤어","coat":"short","source":"wcf","aliases":["European","Celtic","켈틱"],"sheet":"b","cell":18},
  {"id":"german-rex","en":"German Rex","ko":"저먼 렉스","coat":"curly","source":"wcf","aliases":[],"sheet":"b","cell":19},
  {"id":"sokoke","en":"Sokoke","ko":"소코케","coat":"short","source":"fife","aliases":[],"sheet":"b","cell":20},
  {"id":"ragamuffin","en":"Ragamuffin","ko":"라가머핀","coat":"long","source":"wcf","aliases":[],"sheet":"b","cell":21},
  {"id":"anatoli","en":"Anatoli","ko":"아나톨리","coat":"short","source":"wcf","aliases":["Anatolian"],"sheet":"b","cell":22},
  {"id":"aphrodites-giant","en":"Aphrodites Giant","ko":"아프로디테 자이언트","coat":"long","source":"wcf","aliases":["Aphrodite's Giant","아프로디테"],"sheet":"b","cell":23},
  {"id":"arabian-mau","en":"Arabian Mau","ko":"아라비안 마우","coat":"short","source":"wcf","aliases":[],"sheet":"b","cell":24},
  {"id":"asian","en":"Asian","ko":"아시안","coat":"short","source":"gccf","aliases":[],"sheet":"b","cell":25},
  {"id":"brazilian-shorthair","en":"Brazilian Shorthair","ko":"브라질리안 쇼트헤어","coat":"short","source":"wcf","aliases":["Brasilian Shorthair"],"sheet":"b","cell":26},
  {"id":"ceylon","en":"Ceylon","ko":"실론","coat":"short","source":"wcf","aliases":[],"sheet":"b","cell":27},
  {"id":"kanaani","en":"Kanaani","ko":"카나니","coat":"short","source":"wcf","aliases":[],"sheet":"b","cell":28},
  {"id":"karelian-bobtail","en":"Karelian Bobtail","ko":"카렐리안 밥테일","coat":"short","source":"wcf","aliases":[],"sheet":"b","cell":29},
  {"id":"ural-rex","en":"Ural Rex","ko":"우랄 렉스","coat":"curly","source":"wcf","aliases":[],"sheet":"b","cell":30},
  {"id":"german-longhair","en":"German Longhair","ko":"저먼 롱헤어","coat":"long","source":"wcf","aliases":["Deutsch Langhaar"],"sheet":"b","cell":31},
  {"id":"original-longhair","en":"Original Longhair","ko":"오리지널 롱헤어","coat":"long","source":"wcf","aliases":[],"sheet":"b","cell":32},
  {"id":"york-chocolate","en":"York Chocolate","ko":"요크 초콜릿","coat":"long","source":"wcf","aliases":[],"sheet":"b","cell":33},
  {"id":"mekong-bobtail","en":"Mekong Bobtail","ko":"메콩 밥테일","coat":"short","source":"wcf","aliases":[],"sheet":"b","cell":34},
  {"id":"suphalak","en":"Suphalak","ko":"수팔락","coat":"short","source":"wcf","aliases":[],"sheet":"b","cell":35},
  {"id":"aztek","en":"Aztek","ko":"아즈텍","coat":"short","source":"wcf","aliases":[],"sheet":"c","cell":0},
  {"id":"transylvanian","en":"Transylvanian","ko":"트란실바니안","coat":"short","source":"wcf","aliases":[],"sheet":"c","cell":1},
  {"id":"konja","en":"Konja","ko":"콘자","coat":"short","source":"wcf","aliases":[],"sheet":"c","cell":2},
  {"id":"colorpoint-shorthair","en":"Colorpoint Shorthair","ko":"컬러포인트 쇼트헤어","coat":"short","source":"wcf","aliases":["Colourpoint Shorthair"],"sheet":"c","cell":3},
  {"id":"foreign-white-shorthair","en":"Foreign White Shorthair","ko":"포린 화이트 단모","coat":"short","source":"wcf","aliases":[],"sheet":"c","cell":4},
  {"id":"foreign-white-longhair","en":"Foreign White Longhair","ko":"포린 화이트 장모","coat":"long","source":"wcf","aliases":[],"sheet":"c","cell":5},
  {"id":"european-burmese","en":"European Burmese","ko":"유러피안 버미즈","coat":"short","source":"wcf","aliases":["Burmese European"],"sheet":"c","cell":6},
  {"id":"suffolk","en":"Suffolk","ko":"서퍽","coat":"short","source":"gccf","aliases":[],"sheet":"c","cell":7},
  {"id":"thai-lilac","en":"Thai Lilac","ko":"타이 라일락","coat":"short","source":"gccf","aliases":[],"sheet":"c","cell":8},
  {"id":"thai-blue-point","en":"Thai Blue Point","ko":"타이 블루 포인트","coat":"short","source":"gccf","aliases":[],"sheet":"c","cell":9},
  {"id":"thai-lilac-point","en":"Thai Lilac Point","ko":"타이 라일락 포인트","coat":"short","source":"gccf","aliases":[],"sheet":"c","cell":10},
  {"id":"chinchilla-longhair","en":"Chinchilla Longhair","ko":"친칠라 롱헤어","coat":"long","source":"wcf","aliases":[],"sheet":"c","cell":11},
  {"id":"burmese-longhair","en":"Burmese Longhair","ko":"버미즈 롱헤어","coat":"long","source":"wcf","aliases":["Tiffany","티파니"],"sheet":"c","cell":12},
  {"id":"cornish-rex-longhair","en":"Cornish Rex Longhair","ko":"코니시 렉스 장모","coat":"curly","source":"wcf","aliases":["Californian Rex","캘리포니안 렉스"],"sheet":"c","cell":13},
  {"id":"asian-longhair","en":"Asian Longhair","ko":"아시안 롱헤어","coat":"long","source":"wcf","aliases":["Tiffanie","티파니에"],"sheet":"c","cell":14},
  {"id":"turkish-vankedisi","en":"Turkish Vankedisi","ko":"터키시 반케디시","coat":"long","source":"gccf","aliases":["Vankedisi"],"sheet":"c","cell":15},
  {"id":"russian-white","en":"Russian White","ko":"러시안 화이트","coat":"short","source":"gccf","aliases":[],"sheet":"c","cell":16},
  {"id":"russian-black","en":"Russian Black","ko":"러시안 블랙","coat":"short","source":"gccf","aliases":[],"sheet":"c","cell":17},
  {"id":"ocicat-classic","en":"Ocicat Classic","ko":"오시캣 클래식","coat":"short","source":"gccf","aliases":[],"sheet":"c","cell":18},
  {"id":"domestic-longhair","en":"Domestic Longhair","ko":"장모 집고양이","coat":"house","source":"companion","aliases":["House Cat Longhair","Household Pet Longhair"],"sheet":"c","cell":19},
  {"id":"domestic-mediumhair","en":"Domestic Mediumhair","ko":"중장모 집고양이","coat":"house","source":"companion","aliases":[],"sheet":"c","cell":20},
  {"id":"domestic-black","en":"Domestic Black","ko":"검은 집고양이","coat":"house","source":"companion","aliases":["검냥이"],"sheet":"c","cell":21},
  {"id":"domestic-tuxedo","en":"Domestic Tuxedo","ko":"턱시도 집고양이","coat":"house","source":"companion","aliases":[],"sheet":"c","cell":22},
  {"id":"domestic-calico","en":"Domestic Calico","ko":"삼색 집고양이","coat":"house","source":"companion","aliases":["삼색이"],"sheet":"c","cell":23},
  {"id":"domestic-tortoiseshell","en":"Domestic Tortoiseshell","ko":"카오스 집고양이","coat":"house","source":"companion","aliases":["거북무늬"],"sheet":"c","cell":24},
  {"id":"domestic-orange-tabby","en":"Domestic Orange Tabby","ko":"치즈 집고양이","coat":"house","source":"companion","aliases":["치즈냥이"],"sheet":"c","cell":25},
  {"id":"domestic-brown-tabby","en":"Domestic Brown Tabby","ko":"고등어 집고양이","coat":"house","source":"companion","aliases":["고등어태비"],"sheet":"c","cell":26},
  {"id":"domestic-white","en":"Domestic White","ko":"흰 집고양이","coat":"house","source":"companion","aliases":[],"sheet":"c","cell":27},
  {"id":"domestic-bicolor","en":"Domestic Bicolor","ko":"두색 집고양이","coat":"house","source":"companion","aliases":["바이컬러"],"sheet":"c","cell":28},
  {"id":"domestic-silver-tabby","en":"Domestic Silver Tabby","ko":"실버 태비 집고양이","coat":"house","source":"companion","aliases":[],"sheet":"c","cell":29},
  {"id":"domestic-spotted-tabby","en":"Domestic Spotted Tabby","ko":"점박이 집고양이","coat":"house","source":"companion","aliases":[],"sheet":"c","cell":30},
  {"id":"domestic-classic-tabby","en":"Domestic Classic Tabby","ko":"클래식 태비 집고양이","coat":"house","source":"companion","aliases":[],"sheet":"c","cell":31},
  {"id":"domestic-mackerel-tabby","en":"Domestic Mackerel Tabby","ko":"줄무늬 집고양이","coat":"house","source":"companion","aliases":[],"sheet":"c","cell":32},
  {"id":"domestic-ticked-tabby","en":"Domestic Ticked Tabby","ko":"틱드 태비 집고양이","coat":"house","source":"companion","aliases":[],"sheet":"c","cell":33},
  {"id":"domestic-colorpoint","en":"Domestic Colorpoint","ko":"포인트 집고양이","coat":"house","source":"companion","aliases":[],"sheet":"c","cell":34},
  {"id":"domestic-dilute-calico","en":"Domestic Dilute Calico","ko":"연한 삼색 집고양이","coat":"house","source":"companion","aliases":[],"sheet":"c","cell":35},
  {"id":"american-bobtail-shorthair","en":"American Bobtail Shorthair","ko":"아메리칸 밥테일 단모","coat":"short","source":"tica","aliases":[],"sheet":"a","cell":0,"variantOf":"american-bobtail"},
  {"id":"american-curl-longhair","en":"American Curl Longhair","ko":"아메리칸 컬 장모","coat":"long","source":"tica","aliases":[],"sheet":"a","cell":1,"variantOf":"american-curl"},
  {"id":"bengal-longhair","en":"Bengal Longhair","ko":"벵갈 롱헤어","coat":"long","source":"tica","aliases":["Cashmere","캐시미어"],"sheet":"core","cell":7,"variantOf":"bengal"},
  {"id":"burmilla-longhair","en":"Burmilla Longhair","ko":"버밀라 롱헤어","coat":"long","source":"tica","aliases":[],"sheet":"a","cell":9,"variantOf":"burmilla"},
  {"id":"cymric-tailed","en":"Cymric Tailed","ko":"킴릭 테일드","coat":"long","source":"tica","aliases":[],"sheet":"a","cell":14,"variantOf":"cymric"},
  {"id":"highlander-shorthair","en":"Highlander Shorthair","ko":"하이랜더 단모","coat":"short","source":"tica","aliases":[],"sheet":"a","cell":20,"variantOf":"highlander"},
  {"id":"japanese-bobtail-longhair","en":"Japanese Bobtail Longhair","ko":"재패니즈 밥테일 장모","coat":"long","source":"tica","aliases":[],"sheet":"a","cell":22,"variantOf":"japanese-bobtail"},
  {"id":"kurilian-bobtail-longhair","en":"Kurilian Bobtail Longhair","ko":"쿠릴리안 밥테일 장모","coat":"long","source":"tica","aliases":["Kurilean Bobtail Longhair"],"sheet":"a","cell":25,"variantOf":"kurilian-bobtail"},
  {"id":"laperm-shorthair","en":"LaPerm Shorthair","ko":"라펌 단모","coat":"curly","source":"tica","aliases":[],"sheet":"a","cell":26,"variantOf":"laperm"},
  {"id":"maine-coon-polydactyl","en":"Maine Coon Polydactyl","ko":"메인쿤 다지증형","coat":"long","source":"tica","aliases":[],"sheet":"core","cell":6,"variantOf":"maine-coon"},
  {"id":"manx-tailed","en":"Manx Tailed","ko":"맹크스 테일드","coat":"short","source":"tica","aliases":[],"sheet":"a","cell":28,"variantOf":"manx"},
  {"id":"minuet-longhair","en":"Minuet Longhair","ko":"미뉴에트 장모","coat":"long","source":"tica","aliases":[],"sheet":"a","cell":29,"variantOf":"minuet"},
  {"id":"minuet-talls","en":"Minuet Talls","ko":"미뉴에트 톨스","coat":"short","source":"tica","aliases":[],"sheet":"a","cell":29,"variantOf":"minuet"},
  {"id":"minuet-talls-longhair","en":"Minuet Talls Longhair","ko":"미뉴에트 톨스 장모","coat":"long","source":"tica","aliases":[],"sheet":"a","cell":29,"variantOf":"minuet"},
  {"id":"munchkin-longhair","en":"Munchkin Longhair","ko":"먼치킨 롱헤어","coat":"long","source":"tica","aliases":[],"sheet":"a","cell":30,"variantOf":"munchkin"},
  {"id":"pixiebob-longhair","en":"Pixiebob Longhair","ko":"픽시밥 장모","coat":"long","source":"tica","aliases":[],"sheet":"b","cell":0,"variantOf":"pixiebob"},
  {"id":"scottish-fold-longhair","en":"Scottish Fold Longhair","ko":"스코티시 폴드 장모","coat":"long","source":"tica","aliases":["Highland Fold","하이랜드 폴드"],"sheet":"b","cell":2,"variantOf":"scottish-fold"},
  {"id":"scottish-straight-longhair","en":"Scottish Straight Longhair","ko":"스코티시 스트레이트 장모","coat":"long","source":"tica","aliases":["Highland Straight","하이랜드 스트레이트"],"sheet":"b","cell":3,"variantOf":"scottish-straight"},
  {"id":"selkirk-rex-longhair","en":"Selkirk Rex Longhair","ko":"셀커크 렉스 장모","coat":"curly","source":"tica","aliases":[],"sheet":"b","cell":4,"variantOf":"selkirk-rex"},
  {"id":"aphrodites-giant-shorthair","en":"Aphrodites Giant Shorthair","ko":"아프로디테 자이언트 단모","coat":"short","source":"wcf","aliases":[],"sheet":"b","cell":23,"variantOf":"aphrodites-giant"},
  {"id":"karelian-bobtail-longhair","en":"Karelian Bobtail Longhair","ko":"카렐리안 밥테일 장모","coat":"long","source":"wcf","aliases":[],"sheet":"b","cell":29,"variantOf":"karelian-bobtail"},
  {"id":"ural-rex-longhair","en":"Ural Rex Longhair","ko":"우랄 렉스 장모","coat":"curly","source":"wcf","aliases":[],"sheet":"b","cell":30,"variantOf":"ural-rex"},
  {"id":"lykoi-longhair","en":"Lykoi Longhair","ko":"라이코이 장모","coat":"hairless","source":"gccf","aliases":[],"sheet":"a","cell":27,"variantOf":"lykoi"},
  {"id":"somali-shorthair","en":"Somali Shorthair","ko":"소말리 단모","coat":"short","source":"gccf","aliases":[],"sheet":"b","cell":9,"variantOf":"somali"}
].map(cat => Object.freeze({...cat, aliases: Object.freeze(cat.aliases)})));

// Bundled code may live beside a page or inside chunks/. Asset paths belong
// to the document, while Node-only consumers resolve from the source root.
const assetBase = globalThis.document?.baseURI ?? new URL('../', import.meta.url).href;
const atlasUrls = Object.freeze({
  core: new URL('assets/companions/map-portraits-core-v1.png', assetBase).href,
  a: new URL('assets/companions/map-portraits-a-v1.png', assetBase).href,
  b: new URL('assets/companions/map-portraits-b-v1.png', assetBase).href,
  c: new URL('assets/companions/map-portraits-c-v1.png', assetBase).href,
});

// MEOW는 변형 품종을 중복 버튼으로 표시하지 않고 같은 얼굴 그룹으로 묶는다.
export const catGroups = Object.freeze(catBreeds.filter(cat => !cat.variantOf).map(cat => {
  const entries = catBreeds.filter(entry => (entry.variantOf ?? entry.id) === cat.id);
  return Object.freeze({ id: 'cat:' + cat.id, cat,
    breedIds: Object.freeze(entries.map(entry => entry.id)),
    coats: Object.freeze([...new Set(entries.map(entry => entry.coat))]),
  });
}));
export const COMPANIONS = Object.freeze(catGroups.map(group => {
  const cat = group.cat;
  const cols = cat.sheet === 'core' ? 4 : 6;
  const rows = cat.sheet === 'core' ? 3 : 6;
  // 정사각형 원본 core atlas의 4열·3행 중앙 좌표를 MEOW CatAvatar와 동일하게 계산.
  const y = ((Math.floor(cat.cell / cols) + 0.5) / rows * cols - 0.5) / (cols - 1) * 100;
  return Object.freeze({ id: cat.id, groupId: group.id, name: cat.ko, englishName: cat.en,
    image: atlasUrls[cat.sheet], backgroundSize: (cols * 100) + '% ' + (cols * 100) + '%',
    backgroundPosition: ((cat.cell % cols) / (cols - 1) * 100) + '% ' + y + '%',
    coats: group.coats, breedIds: group.breedIds, sheet: cat.sheet, cell: cat.cell,
  });
}));
const companionsById = new Map(COMPANIONS.flatMap(companion => companion.breedIds.map(id => [id, companion])));
const groupsById = new Map(catGroups.flatMap(group => group.breedIds.map(id => [id, group])));
export const getCompanion = catId => companionsById.get(catId);
export const catGroupFor = catId => groupsById.get(catId);
export const catById = catId => catBreeds.find(cat => cat.id === catId);
export const coatLabels = COAT_LABELS;
export const mbtiTypes = MBTI_TYPES;

/** 폭/높이는 UI가 지정한다. <img> 대신 배경 이미지가 있는 요소에 적용한다. */
export function companionAvatarStyle(catId) {
  const companion = getCompanion(catId);
  if (!companion) return null;
  return { backgroundImage: 'url("' + companion.image + '")', backgroundSize: companion.backgroundSize,
    backgroundPosition: companion.backgroundPosition, backgroundRepeat: 'no-repeat' };
}
export function isCompanionProfile(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value)
    && typeof value.catId === 'string' && getCompanion(value.catId) && MBTI_TYPES.includes(value.mbti));
}
export const isValidProfile = isCompanionProfile;
/** MEOW와 동일하게 기존 변형 품종 ID를 같은 얼굴의 canonical catId로 정규화한다. */
export function normalizeCompanionProfile(value) {
  if (!isCompanionProfile(value)) throw new TypeError('고양이와 MBTI를 모두 선택해 주세요.');
  const companion = getCompanion(value.catId);
  return { catId: companion.id, mbti: value.mbti, groupId: companion.groupId };
}
