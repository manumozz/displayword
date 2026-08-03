// ISO 3166-1 alpha-2 → русское название. Полный список стран-членов ООН + основные территории.
// Отсортирован по русскому названию (localeCompare ru).
const DW_COUNTRIES = [
  {
    "code": "AU",
    "name": "Австралия"
  },
  {
    "code": "AT",
    "name": "Австрия"
  },
  {
    "code": "AZ",
    "name": "Азербайджан"
  },
  {
    "code": "AX",
    "name": "Аландские о-ва"
  },
  {
    "code": "AL",
    "name": "Албания"
  },
  {
    "code": "DZ",
    "name": "Алжир"
  },
  {
    "code": "AS",
    "name": "Американское Самоа"
  },
  {
    "code": "AI",
    "name": "Ангилья"
  },
  {
    "code": "AO",
    "name": "Ангола"
  },
  {
    "code": "AD",
    "name": "Андорра"
  },
  {
    "code": "AQ",
    "name": "Антарктида"
  },
  {
    "code": "AG",
    "name": "Антигуа и Барбуда"
  },
  {
    "code": "AR",
    "name": "Аргентина"
  },
  {
    "code": "AM",
    "name": "Армения"
  },
  {
    "code": "AW",
    "name": "Аруба"
  },
  {
    "code": "AF",
    "name": "Афганистан"
  },
  {
    "code": "BS",
    "name": "Багамы"
  },
  {
    "code": "BD",
    "name": "Бангладеш"
  },
  {
    "code": "BB",
    "name": "Барбадос"
  },
  {
    "code": "BH",
    "name": "Бахрейн"
  },
  {
    "code": "BY",
    "name": "Беларусь"
  },
  {
    "code": "BZ",
    "name": "Белиз"
  },
  {
    "code": "BE",
    "name": "Бельгия"
  },
  {
    "code": "BJ",
    "name": "Бенин"
  },
  {
    "code": "BM",
    "name": "Бермудские о-ва"
  },
  {
    "code": "BG",
    "name": "Болгария"
  },
  {
    "code": "BO",
    "name": "Боливия"
  },
  {
    "code": "BQ",
    "name": "Бонэйр, Синт-Эстатиус и Саба"
  },
  {
    "code": "BA",
    "name": "Босния и Герцеговина"
  },
  {
    "code": "BW",
    "name": "Ботсвана"
  },
  {
    "code": "BR",
    "name": "Бразилия"
  },
  {
    "code": "IO",
    "name": "Британская территория в Индийском океане"
  },
  {
    "code": "BN",
    "name": "Бруней"
  },
  {
    "code": "BF",
    "name": "Буркина-Фасо"
  },
  {
    "code": "BI",
    "name": "Бурунди"
  },
  {
    "code": "BT",
    "name": "Бутан"
  },
  {
    "code": "VU",
    "name": "Вануату"
  },
  {
    "code": "VA",
    "name": "Ватикан"
  },
  {
    "code": "GB",
    "name": "Великобритания"
  },
  {
    "code": "HU",
    "name": "Венгрия"
  },
  {
    "code": "VE",
    "name": "Венесуэла"
  },
  {
    "code": "VG",
    "name": "Виргинские о-ва (Великобритания)"
  },
  {
    "code": "VI",
    "name": "Виргинские о-ва (США)"
  },
  {
    "code": "UM",
    "name": "Внешние малые о-ва (США)"
  },
  {
    "code": "TL",
    "name": "Восточный Тимор"
  },
  {
    "code": "VN",
    "name": "Вьетнам"
  },
  {
    "code": "GA",
    "name": "Габон"
  },
  {
    "code": "HT",
    "name": "Гаити"
  },
  {
    "code": "GY",
    "name": "Гайана"
  },
  {
    "code": "GM",
    "name": "Гамбия"
  },
  {
    "code": "GH",
    "name": "Гана"
  },
  {
    "code": "GP",
    "name": "Гваделупа"
  },
  {
    "code": "GT",
    "name": "Гватемала"
  },
  {
    "code": "GN",
    "name": "Гвинея"
  },
  {
    "code": "GW",
    "name": "Гвинея-Бисау"
  },
  {
    "code": "DE",
    "name": "Германия"
  },
  {
    "code": "GG",
    "name": "Гернси"
  },
  {
    "code": "GI",
    "name": "Гибралтар"
  },
  {
    "code": "HN",
    "name": "Гондурас"
  },
  {
    "code": "HK",
    "name": "Гонконг (САР)"
  },
  {
    "code": "GD",
    "name": "Гренада"
  },
  {
    "code": "GL",
    "name": "Гренландия"
  },
  {
    "code": "GR",
    "name": "Греция"
  },
  {
    "code": "GE",
    "name": "Грузия"
  },
  {
    "code": "GU",
    "name": "Гуам"
  },
  {
    "code": "DK",
    "name": "Дания"
  },
  {
    "code": "JE",
    "name": "Джерси"
  },
  {
    "code": "DJ",
    "name": "Джибути"
  },
  {
    "code": "DM",
    "name": "Доминика"
  },
  {
    "code": "DO",
    "name": "Доминиканская Республика"
  },
  {
    "code": "EG",
    "name": "Египет"
  },
  {
    "code": "ZM",
    "name": "Замбия"
  },
  {
    "code": "EH",
    "name": "Западная Сахара"
  },
  {
    "code": "ZW",
    "name": "Зимбабве"
  },
  {
    "code": "IL",
    "name": "Израиль"
  },
  {
    "code": "IN",
    "name": "Индия"
  },
  {
    "code": "ID",
    "name": "Индонезия"
  },
  {
    "code": "JO",
    "name": "Иордания"
  },
  {
    "code": "IQ",
    "name": "Ирак"
  },
  {
    "code": "IR",
    "name": "Иран"
  },
  {
    "code": "IE",
    "name": "Ирландия"
  },
  {
    "code": "IS",
    "name": "Исландия"
  },
  {
    "code": "ES",
    "name": "Испания"
  },
  {
    "code": "IT",
    "name": "Италия"
  },
  {
    "code": "YE",
    "name": "Йемен"
  },
  {
    "code": "CV",
    "name": "Кабо-Верде"
  },
  {
    "code": "KZ",
    "name": "Казахстан"
  },
  {
    "code": "KH",
    "name": "Камбоджа"
  },
  {
    "code": "CM",
    "name": "Камерун"
  },
  {
    "code": "CA",
    "name": "Канада"
  },
  {
    "code": "QA",
    "name": "Катар"
  },
  {
    "code": "KE",
    "name": "Кения"
  },
  {
    "code": "CY",
    "name": "Кипр"
  },
  {
    "code": "KG",
    "name": "Киргизия"
  },
  {
    "code": "KI",
    "name": "Кирибати"
  },
  {
    "code": "CN",
    "name": "Китай"
  },
  {
    "code": "KP",
    "name": "КНДР"
  },
  {
    "code": "CC",
    "name": "Кокосовые о-ва"
  },
  {
    "code": "CO",
    "name": "Колумбия"
  },
  {
    "code": "KM",
    "name": "Коморы"
  },
  {
    "code": "CG",
    "name": "Конго - Браззавиль"
  },
  {
    "code": "CD",
    "name": "Конго - Киншаса"
  },
  {
    "code": "CR",
    "name": "Коста-Рика"
  },
  {
    "code": "CI",
    "name": "Кот-д’Ивуар"
  },
  {
    "code": "CU",
    "name": "Куба"
  },
  {
    "code": "KW",
    "name": "Кувейт"
  },
  {
    "code": "CW",
    "name": "Кюрасао"
  },
  {
    "code": "LA",
    "name": "Лаос"
  },
  {
    "code": "LV",
    "name": "Латвия"
  },
  {
    "code": "LS",
    "name": "Лесото"
  },
  {
    "code": "LR",
    "name": "Либерия"
  },
  {
    "code": "LB",
    "name": "Ливан"
  },
  {
    "code": "LY",
    "name": "Ливия"
  },
  {
    "code": "LT",
    "name": "Литва"
  },
  {
    "code": "LI",
    "name": "Лихтенштейн"
  },
  {
    "code": "LU",
    "name": "Люксембург"
  },
  {
    "code": "MU",
    "name": "Маврикий"
  },
  {
    "code": "MR",
    "name": "Мавритания"
  },
  {
    "code": "MG",
    "name": "Мадагаскар"
  },
  {
    "code": "YT",
    "name": "Майотта"
  },
  {
    "code": "MO",
    "name": "Макао (САР)"
  },
  {
    "code": "MW",
    "name": "Малави"
  },
  {
    "code": "MY",
    "name": "Малайзия"
  },
  {
    "code": "ML",
    "name": "Мали"
  },
  {
    "code": "MV",
    "name": "Мальдивы"
  },
  {
    "code": "MT",
    "name": "Мальта"
  },
  {
    "code": "MA",
    "name": "Марокко"
  },
  {
    "code": "MQ",
    "name": "Мартиника"
  },
  {
    "code": "MH",
    "name": "Маршалловы о-ва"
  },
  {
    "code": "MX",
    "name": "Мексика"
  },
  {
    "code": "MZ",
    "name": "Мозамбик"
  },
  {
    "code": "MD",
    "name": "Молдова"
  },
  {
    "code": "MC",
    "name": "Монако"
  },
  {
    "code": "MN",
    "name": "Монголия"
  },
  {
    "code": "MS",
    "name": "Монтсеррат"
  },
  {
    "code": "MM",
    "name": "Мьянма (Бирма)"
  },
  {
    "code": "NA",
    "name": "Намибия"
  },
  {
    "code": "NR",
    "name": "Науру"
  },
  {
    "code": "NP",
    "name": "Непал"
  },
  {
    "code": "NE",
    "name": "Нигер"
  },
  {
    "code": "NG",
    "name": "Нигерия"
  },
  {
    "code": "NL",
    "name": "Нидерланды"
  },
  {
    "code": "NI",
    "name": "Никарагуа"
  },
  {
    "code": "NU",
    "name": "Ниуэ"
  },
  {
    "code": "NZ",
    "name": "Новая Зеландия"
  },
  {
    "code": "NC",
    "name": "Новая Каледония"
  },
  {
    "code": "NO",
    "name": "Норвегия"
  },
  {
    "code": "BV",
    "name": "о-в Буве"
  },
  {
    "code": "IM",
    "name": "о-в Мэн"
  },
  {
    "code": "NF",
    "name": "о-в Норфолк"
  },
  {
    "code": "CX",
    "name": "о-в Рождества"
  },
  {
    "code": "SH",
    "name": "о-в Св. Елены"
  },
  {
    "code": "KY",
    "name": "о-ва Кайман"
  },
  {
    "code": "CK",
    "name": "о-ва Кука"
  },
  {
    "code": "PN",
    "name": "о-ва Питкэрн"
  },
  {
    "code": "HM",
    "name": "о-ва Херд и Макдональд"
  },
  {
    "code": "AE",
    "name": "ОАЭ"
  },
  {
    "code": "OM",
    "name": "Оман"
  },
  {
    "code": "PK",
    "name": "Пакистан"
  },
  {
    "code": "PW",
    "name": "Палау"
  },
  {
    "code": "PS",
    "name": "Палестинские территории"
  },
  {
    "code": "PA",
    "name": "Панама"
  },
  {
    "code": "PG",
    "name": "Папуа — Новая Гвинея"
  },
  {
    "code": "PY",
    "name": "Парагвай"
  },
  {
    "code": "PE",
    "name": "Перу"
  },
  {
    "code": "PL",
    "name": "Польша"
  },
  {
    "code": "PT",
    "name": "Португалия"
  },
  {
    "code": "PR",
    "name": "Пуэрто-Рико"
  },
  {
    "code": "KR",
    "name": "Республика Корея"
  },
  {
    "code": "RE",
    "name": "Реюньон"
  },
  {
    "code": "RU",
    "name": "Россия"
  },
  {
    "code": "RW",
    "name": "Руанда"
  },
  {
    "code": "RO",
    "name": "Румыния"
  },
  {
    "code": "SV",
    "name": "Сальвадор"
  },
  {
    "code": "WS",
    "name": "Самоа"
  },
  {
    "code": "SM",
    "name": "Сан-Марино"
  },
  {
    "code": "ST",
    "name": "Сан-Томе и Принсипи"
  },
  {
    "code": "SA",
    "name": "Саудовская Аравия"
  },
  {
    "code": "MK",
    "name": "Северная Македония"
  },
  {
    "code": "MP",
    "name": "Северные Марианские о-ва"
  },
  {
    "code": "SC",
    "name": "Сейшельские о-ва"
  },
  {
    "code": "BL",
    "name": "Сен-Бартелеми"
  },
  {
    "code": "MF",
    "name": "Сен-Мартен"
  },
  {
    "code": "PM",
    "name": "Сен-Пьер и Микелон"
  },
  {
    "code": "SN",
    "name": "Сенегал"
  },
  {
    "code": "VC",
    "name": "Сент-Винсент и Гренадины"
  },
  {
    "code": "KN",
    "name": "Сент-Китс и Невис"
  },
  {
    "code": "LC",
    "name": "Сент-Люсия"
  },
  {
    "code": "RS",
    "name": "Сербия"
  },
  {
    "code": "SG",
    "name": "Сингапур"
  },
  {
    "code": "SX",
    "name": "Синт-Мартен"
  },
  {
    "code": "SY",
    "name": "Сирия"
  },
  {
    "code": "SK",
    "name": "Словакия"
  },
  {
    "code": "SI",
    "name": "Словения"
  },
  {
    "code": "US",
    "name": "Соединенные Штаты"
  },
  {
    "code": "SB",
    "name": "Соломоновы о-ва"
  },
  {
    "code": "SO",
    "name": "Сомали"
  },
  {
    "code": "SD",
    "name": "Судан"
  },
  {
    "code": "SR",
    "name": "Суринам"
  },
  {
    "code": "SL",
    "name": "Сьерра-Леоне"
  },
  {
    "code": "TJ",
    "name": "Таджикистан"
  },
  {
    "code": "TH",
    "name": "Таиланд"
  },
  {
    "code": "TW",
    "name": "Тайвань"
  },
  {
    "code": "TZ",
    "name": "Танзания"
  },
  {
    "code": "TC",
    "name": "Тёркс и Кайкос"
  },
  {
    "code": "TG",
    "name": "Того"
  },
  {
    "code": "TK",
    "name": "Токелау"
  },
  {
    "code": "TO",
    "name": "Тонга"
  },
  {
    "code": "TT",
    "name": "Тринидад и Тобаго"
  },
  {
    "code": "TV",
    "name": "Тувалу"
  },
  {
    "code": "TN",
    "name": "Тунис"
  },
  {
    "code": "TM",
    "name": "Туркменистан"
  },
  {
    "code": "TR",
    "name": "Турция"
  },
  {
    "code": "UG",
    "name": "Уганда"
  },
  {
    "code": "UZ",
    "name": "Узбекистан"
  },
  {
    "code": "UA",
    "name": "Украина"
  },
  {
    "code": "WF",
    "name": "Уоллис и Футуна"
  },
  {
    "code": "UY",
    "name": "Уругвай"
  },
  {
    "code": "FO",
    "name": "Фарерские о-ва"
  },
  {
    "code": "FM",
    "name": "Федеративные Штаты Микронезии"
  },
  {
    "code": "FJ",
    "name": "Фиджи"
  },
  {
    "code": "PH",
    "name": "Филиппины"
  },
  {
    "code": "FI",
    "name": "Финляндия"
  },
  {
    "code": "FK",
    "name": "Фолклендские о-ва"
  },
  {
    "code": "FR",
    "name": "Франция"
  },
  {
    "code": "GF",
    "name": "Французская Гвиана"
  },
  {
    "code": "PF",
    "name": "Французская Полинезия"
  },
  {
    "code": "TF",
    "name": "Французские Южные территории"
  },
  {
    "code": "HR",
    "name": "Хорватия"
  },
  {
    "code": "CF",
    "name": "Центрально-Африканская Республика"
  },
  {
    "code": "TD",
    "name": "Чад"
  },
  {
    "code": "ME",
    "name": "Черногория"
  },
  {
    "code": "CZ",
    "name": "Чехия"
  },
  {
    "code": "CL",
    "name": "Чили"
  },
  {
    "code": "CH",
    "name": "Швейцария"
  },
  {
    "code": "SE",
    "name": "Швеция"
  },
  {
    "code": "SJ",
    "name": "Шпицберген и Ян-Майен"
  },
  {
    "code": "LK",
    "name": "Шри-Ланка"
  },
  {
    "code": "EC",
    "name": "Эквадор"
  },
  {
    "code": "GQ",
    "name": "Экваториальная Гвинея"
  },
  {
    "code": "ER",
    "name": "Эритрея"
  },
  {
    "code": "SZ",
    "name": "Эсватини"
  },
  {
    "code": "EE",
    "name": "Эстония"
  },
  {
    "code": "ET",
    "name": "Эфиопия"
  },
  {
    "code": "GS",
    "name": "Южная Георгия и Южные Сандвичевы о-ва"
  },
  {
    "code": "ZA",
    "name": "Южно-Африканская Республика"
  },
  {
    "code": "SS",
    "name": "Южный Судан"
  },
  {
    "code": "JM",
    "name": "Ямайка"
  },
  {
    "code": "JP",
    "name": "Япония"
  }
];

function dwCountryName(code) {
  if (!code) return '';
  const row = DW_COUNTRIES.find(c => c.code === code);
  return row ? row.name : code;
}

/** Fill a <select> with DW_COUNTRIES. firstLabel — empty option text. */
function dwFillCountrySelect(selectEl, firstLabel) {
  if (!selectEl) return;
  const cur = selectEl.value;
  selectEl.innerHTML = '';
  const opt0 = document.createElement('option');
  opt0.value = '';
  opt0.textContent = firstLabel || '— страна —';
  selectEl.appendChild(opt0);
  for (const c of DW_COUNTRIES) {
    const o = document.createElement('option');
    o.value = c.code;
    o.textContent = c.name;
    selectEl.appendChild(o);
  }
  if (cur) selectEl.value = cur;
}
