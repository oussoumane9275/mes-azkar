// Local, offline FAQ used by the in-app assistant (Réglages → Assistant).
// No network call, no AI API — just keyword matching against a fixed list
// of app-usage questions, kept in the app's three languages like the rest
// of the UI text.

const FAQ = {
  fr: [
    {
      id: "azkar-counter",
      keywords: ["azkar", "compteur", "compter", "toucher", "cercle", "zikr", "dhikr", "rond", "repetition", "repetitions"],
      question: "Comment compter mes azkar ?",
      answer:
        "Touche le cercle doré au centre de l'écran à chaque récitation. Le compteur avance tout seul et passe automatiquement au zikr suivant une fois le nombre atteint.",
    },
    {
      id: "azkar-categories",
      keywords: ["matin", "soir", "coucher", "apres priere", "categorie", "categories", "4 azkar"],
      question: "Quelle est la différence entre les 4 catégories d'azkar ?",
      answer:
        "Azkar du matin et du soir sont à réciter à ces moments de la journée, Azkar après-prière juste après chacune des 5 prières, et Azkar du coucher avant de dormir. Elles se trouvent toutes sur l'écran d'accueil.",
    },
    {
      id: "tasbih",
      keywords: ["tasbih", "chapelet", "sobha", "subha"],
      question: "Comment utiliser le Tasbih ?",
      answer:
        "L'onglet Tasbih en bas de l'écran ouvre un compteur libre : touche pour compter, comme un chapelet électronique. Tu peux le remettre à zéro à tout moment.",
    },
    {
      id: "quran-sourates",
      keywords: ["coran", "sourate", "sourates", "verset", "versets", "lire", "lecture", "traduction"],
      question: "Comment lire une sourate verset par verset avec sa traduction ?",
      answer:
        "Coran → onglet Sourates → choisis une sourate. Chaque verset s'affiche avec sa traduction en dessous, et tu peux toucher un verset pour l'écouter avec un récitateur.",
    },
    {
      id: "quran-mushaf",
      keywords: ["mushaf", "page", "pages", "imprime", "coran page", "traduction verset", "tafsir"],
      question: "Comment voir la traduction d'un verset dans le Mushaf (page imprimée) ?",
      answer:
        "Coran → onglet Mushaf, qui affiche le Coran comme un vrai livre imprimé. Touche un mot d'un verset : un petit menu apparaît avec un bouton ▶ pour écouter juste ce verset, et un bouton 🌐 pour voir sa traduction.",
    },
    {
      id: "quran-reciters",
      keywords: ["reciter", "reciteur", "reciteurs", "ecouter coran", "recitation", "voix"],
      question: "Comment écouter le Coran en continu avec un récitateur ?",
      answer:
        "Coran → onglet Récitateurs → choisis une voix. Tu entres dans son espace où tu peux lancer n'importe quelle sourate en écoute continue.",
    },
    {
      id: "quran-offline",
      keywords: ["hors ligne", "offline", "telecharger", "telechargement", "sans internet", "avion"],
      question: "Peut-on lire le Coran sans connexion internet ?",
      answer:
        "Oui : dans Coran → Mushaf, tu peux télécharger les pages à l'avance pour les lire hors-ligne ensuite (utile en avion ou sans réseau).",
    },
    {
      id: "qibla",
      keywords: ["qibla", "direction", "mecque", "kaaba", "boussole"],
      question: "Comment trouver la direction de la Qibla ?",
      answer:
        "Sur l'écran d'accueil, touche « Qibla — direction de la Mecque ». L'appli utilise la boussole du téléphone pour t'indiquer la direction à suivre.",
    },
    {
      id: "nawafil",
      keywords: ["nawafil", "prieres surerogatoires", "sounan", "sunna"],
      question: "C'est quoi Nawafil ?",
      answer:
        "Nawafil regroupe les prières surérogatoires (non obligatoires) que tu peux suivre depuis l'écran d'accueil, en plus des 5 prières obligatoires.",
    },
    {
      id: "prayer-reminders",
      keywords: ["rappel", "rappels", "notification", "notifications", "cloche", "alerte", "horaire", "horaires", "priere"],
      question: "Comment activer ou couper les rappels pour une prière ?",
      answer:
        "Sur l'écran d'accueil, chaque prière a une petite cloche en dessous de son heure : touche-la pour activer ou désactiver son rappel individuellement.",
    },
    {
      id: "bilan",
      keywords: ["bilan", "historique", "statistique", "statistiques", "progres", "suivi"],
      question: "À quoi sert l'onglet Bilan ?",
      answer:
        "L'onglet Bilan montre ton historique et tes statistiques : les azkar complétés, ta série de jours consécutifs (streak), et ta progression dans le Coran.",
    },
    {
      id: "theme",
      keywords: ["theme", "sombre", "clair", "nuit", "mode nuit", "couleur fond"],
      question: "Comment passer en thème sombre ou clair ?",
      answer:
        "Touche l'icône lune/soleil en haut de l'écran d'accueil, ou va dans Réglages pour choisir Clair, Sombre, ou automatique (selon ton téléphone).",
    },
    {
      id: "language",
      keywords: ["langue", "francais", "anglais", "arabe", "traduire interface"],
      question: "Comment changer la langue de l'application ?",
      answer:
        "Touche l'icône de globe en haut de l'écran d'accueil, ou va dans Réglages, pour choisir entre français, anglais et arabe.",
    },
    {
      id: "arabic-size",
      keywords: ["taille texte", "police", "grand", "petit", "agrandir", "texte arabe"],
      question: "Comment agrandir le texte arabe ?",
      answer: "Dans Réglages, tu trouveras un réglage de taille du texte arabe avec plusieurs tailles au choix.",
    },
    {
      id: "accent-color",
      keywords: ["couleur", "accent", "personnaliser", "theme couleur"],
      question: "Peut-on changer la couleur de l'application ?",
      answer: "Oui, dans Réglages tu peux choisir parmi plusieurs couleurs d'accent pour personnaliser l'appli.",
    },
    {
      id: "backup",
      keywords: ["sauvegarde", "sauvegarder", "restaurer", "exporter", "importer", "backup", "changer telephone", "nouveau telephone"],
      question: "Comment sauvegarder mes données ou les récupérer sur un nouveau téléphone ?",
      answer:
        "Dans Réglages, la section export/import te permet de sauvegarder tes données dans un fichier, puis de les restaurer sur un autre appareil.",
    },
    {
      id: "bookmark",
      keywords: ["signet", "marque page", "reprendre", "favoris"],
      question: "Comment mettre un signet dans le Coran ?",
      answer:
        "Dans le Mushaf, touche l'icône étoile en bas de la page pour l'ajouter à tes signets — tu pourras y revenir directement depuis le menu « Aller à… ».",
    },
    {
      id: "support",
      keywords: ["probleme", "bug", "plante", "erreur", "contact", "aide", "support", "ne marche pas"],
      question: "L'application a un problème, comment vous contacter ?",
      answer:
        "Va dans Réglages → Contactez-nous pour nous écrire directement par e-mail et décrire le problème rencontré.",
    },
    // Azkar knowledge — content pulled verbatim from the app's own Tasbih
    // formulas (Hisn al-Muslim), not generated, so the hadith attributions
    // stay accurate and match what's already shown in the Tasbih screen.
    {
      id: "best-dhikr",
      keywords: ["meilleur dhikr", "meilleure invocation", "meilleure parole", "quel dhikr"],
      question: "Quel est le meilleur dhikr ?",
      answer:
        "لَا إِلَٰهَ إِلَّا اللَّهُ — « Il n'y a de divinité qu'Allah. » La meilleure invocation, selon le Prophète ﷺ, est celle qu'il a lui-même prononcée ainsi que les prophètes avant lui. Rapporté par at-Tirmidhi.",
    },
    {
      id: "dhikr-subhanallah",
      keywords: ["subhanallah", "gloire a allah", "leger sur la langue"],
      question: "Quel est le mérite de « Subhanallahi wa bihamdihi » ?",
      answer:
        "سُبْحَانَ اللَّهِ وَبِحَمْدِهِ — « Gloire et pureté à Allah, et louange à Lui. » Deux paroles légères sur la langue, lourdes dans la balance des bonnes actions et aimées du Tout Miséricordieux. Rapporté par al-Bukhari et Muslim.",
    },
    {
      id: "dhikr-istighfar",
      keywords: ["istighfar", "pardon", "demander pardon", "repentir"],
      question: "Pourquoi dire souvent Astaghfirullah ?",
      answer:
        "أَسْتَغْفِرُ اللَّهَ — « Je demande pardon à Allah. » Le Prophète ﷺ, pourtant préservé du péché, demandait pardon à Allah plus de soixante-dix fois par jour. Rapporté par al-Bukhari.",
    },
    {
      id: "dhikr-hawla-quwwata",
      keywords: ["tresor du paradis", "la hawla", "force et puissance"],
      question: "Quel dhikr est un trésor du Paradis ?",
      answer:
        "لَا حَوْلَ وَلَا قُوَّةَ إِلَّا بِاللَّهِ — « Il n'y a de force ni de puissance qu'en Allah. » Le Prophète ﷺ l'a désignée comme un trésor parmi les trésors du Paradis. Rapporté par al-Bukhari et Muslim.",
    },
    {
      id: "dhikr-affliction",
      keywords: ["difficulte", "epreuve", "affliction", "malade", "maladie", "invocation de younes", "dhikr younes", "yunus"],
      question: "Quelle invocation dire face à une épreuve ou une maladie ?",
      answer:
        "لَا إِلَٰهَ إِلَّا أَنْتَ سُبْحَانَكَ إِنِّي كُنْتُ مِنَ الظَّالِمِينَ — l'invocation du prophète Yūnus, par laquelle il fut délivré du ventre de la baleine. Le Prophète ﷺ a dit qu'aucun musulman ne l'invoque pour une affliction sans qu'Allah ne la lui dissipe. Rapporté par at-Tirmidhi.",
    },
    {
      id: "dhikr-salawat",
      keywords: ["salawat", "prier sur le prophete", "benediction sur le prophete"],
      question: "Quel est le mérite de prier sur le Prophète (salawat) ?",
      answer:
        "اللَّهُمَّ صَلِّ عَلَىٰ مُحَمَّدٍ — « Ô Allah, prie sur Muhammad. » Quiconque prie une fois sur le Prophète ﷺ, Allah prie dix fois sur lui en retour. Rapporté par Muslim.",
    },
  ],
  en: [
    {
      id: "azkar-counter",
      keywords: ["azkar", "counter", "count", "tap", "circle", "zikr", "dhikr", "repetition", "repetitions"],
      question: "How do I count my azkar?",
      answer:
        "Tap the golden circle in the middle of the screen for each recitation. The counter advances on its own and moves to the next zikr once the count is reached.",
    },
    {
      id: "azkar-categories",
      keywords: ["morning", "evening", "night", "after prayer", "category", "categories", "4 azkar"],
      question: "What's the difference between the 4 azkar categories?",
      answer:
        "Morning and Evening azkar are recited at those times of day, After-prayer azkar right after each of the 5 daily prayers, and Bedtime azkar before sleeping. All four are on the home screen.",
    },
    {
      id: "tasbih",
      keywords: ["tasbih", "beads", "counter tool"],
      question: "How do I use the Tasbih?",
      answer:
        "The Tasbih tab at the bottom opens a free counter: tap to count, like an electronic prayer bead. You can reset it any time.",
    },
    {
      id: "quran-sourates",
      keywords: ["quran", "surah", "surahs", "verse", "verses", "read", "translation"],
      question: "How do I read a surah verse by verse with its translation?",
      answer:
        "Quran → Surahs tab → pick a surah. Each verse shows its translation underneath, and tapping a verse plays it with a reciter.",
    },
    {
      id: "quran-mushaf",
      keywords: ["mushaf", "page", "pages", "printed", "quran page", "verse translation", "tafsir"],
      question: "How do I see a verse's translation in the Mushaf (printed page)?",
      answer:
        "Quran → Mushaf tab, showing the Quran as a real printed book. Tap a word in a verse: a small toolbar appears with a ▶ button to listen to just that verse, and a 🌐 button to see its translation.",
    },
    {
      id: "quran-reciters",
      keywords: ["reciter", "reciters", "listen quran", "recitation", "voice"],
      question: "How do I listen to the Quran continuously with a reciter?",
      answer:
        "Quran → Reciters tab → pick a voice. You enter their space where you can start any surah for continuous listening.",
    },
    {
      id: "quran-offline",
      keywords: ["offline", "download", "no internet", "flight"],
      question: "Can I read the Quran without an internet connection?",
      answer: "Yes: in Quran → Mushaf, you can download pages in advance to read them offline later (handy on a flight or with no signal).",
    },
    {
      id: "qibla",
      keywords: ["qibla", "direction", "mecca", "kaaba", "compass"],
      question: "How do I find the Qibla direction?",
      answer: "On the home screen, tap \"Qibla — direction to Mecca\". The app uses your phone's compass to point you the right way.",
    },
    {
      id: "nawafil",
      keywords: ["nawafil", "voluntary prayers", "sunnah prayers"],
      question: "What is Nawafil?",
      answer: "Nawafil lists the voluntary (non-obligatory) prayers you can follow from the home screen, alongside the 5 daily prayers.",
    },
    {
      id: "prayer-reminders",
      keywords: ["reminder", "reminders", "notification", "notifications", "bell", "alert", "prayer time"],
      question: "How do I turn a prayer reminder on or off?",
      answer: "On the home screen, each prayer has a small bell under its time — tap it to turn its reminder on or off individually.",
    },
    {
      id: "bilan",
      keywords: ["stats", "statistics", "history", "progress", "tracking"],
      question: "What is the Stats tab for?",
      answer: "The Stats tab shows your history: completed azkar, your day streak, and your progress through the Quran.",
    },
    {
      id: "theme",
      keywords: ["theme", "dark", "light", "night mode"],
      question: "How do I switch to dark or light theme?",
      answer: "Tap the moon/sun icon at the top of the home screen, or go to Settings to choose Light, Dark, or automatic (matching your phone).",
    },
    {
      id: "language",
      keywords: ["language", "french", "english", "arabic"],
      question: "How do I change the app's language?",
      answer: "Tap the globe icon at the top of the home screen, or go to Settings, to choose between French, English and Arabic.",
    },
    {
      id: "arabic-size",
      keywords: ["text size", "font size", "bigger text", "arabic text"],
      question: "How do I make the Arabic text bigger?",
      answer: "In Settings, there's an Arabic text size option with several sizes to choose from.",
    },
    {
      id: "accent-color",
      keywords: ["color", "accent", "customize", "theme color"],
      question: "Can I change the app's color?",
      answer: "Yes, in Settings you can pick from several accent colors to personalize the app.",
    },
    {
      id: "backup",
      keywords: ["backup", "restore", "export", "import", "new phone", "transfer"],
      question: "How do I back up my data or get it onto a new phone?",
      answer: "In Settings, the export/import section lets you save your data to a file, then restore it on another device.",
    },
    {
      id: "bookmark",
      keywords: ["bookmark", "save page", "resume"],
      question: "How do I bookmark a page in the Quran?",
      answer: "In the Mushaf, tap the star icon at the bottom of the page to add it to your bookmarks — find it again from the \"Go to…\" menu.",
    },
    {
      id: "support",
      keywords: ["problem", "bug", "crash", "error", "contact", "help", "support", "not working"],
      question: "The app has an issue, how do I contact you?",
      answer: "Go to Settings → Contact us to email us directly and describe the issue.",
    },
    // Azkar knowledge — content pulled verbatim from the app's own Tasbih
    // formulas (Hisn al-Muslim), not generated, so the hadith attributions
    // stay accurate and match what's already shown in the Tasbih screen.
    {
      id: "best-dhikr",
      keywords: ["best dhikr", "best invocation", "best supplication", "which dhikr"],
      question: "What is the best dhikr?",
      answer:
        "لَا إِلَٰهَ إِلَّا اللَّهُ — \"None has the right to be worshipped except Allah.\" The best supplication, according to the Prophet ﷺ, is the one he himself said, as did the prophets before him. Narrated by at-Tirmidhi.",
    },
    {
      id: "dhikr-subhanallah",
      keywords: ["subhanallah", "glory be to allah", "light on the tongue"],
      question: "What is the merit of \"Subhanallahi wa bihamdihi\"?",
      answer:
        "سُبْحَانَ اللَّهِ وَبِحَمْدِهِ — \"How perfect Allah is and I praise Him.\" Two words light on the tongue, heavy on the scale of good deeds, and beloved to the Most Merciful. Narrated by al-Bukhari and Muslim.",
    },
    {
      id: "dhikr-istighfar",
      keywords: ["istighfar", "forgiveness", "seek forgiveness", "repentance"],
      question: "Why say Astaghfirullah often?",
      answer:
        "أَسْتَغْفِرُ اللَّهَ — \"I seek the forgiveness of Allah.\" The Prophet ﷺ, though protected from sin, asked Allah's forgiveness more than seventy times a day. Narrated by al-Bukhari.",
    },
    {
      id: "dhikr-hawla-quwwata",
      keywords: ["treasure of paradise", "la hawla", "power and strength"],
      question: "Which dhikr is a treasure of Paradise?",
      answer:
        "لَا حَوْلَ وَلَا قُوَّةَ إِلَّا بِاللَّهِ — \"There is no power and no strength except with Allah.\" The Prophet ﷺ called it a treasure among the treasures of Paradise. Narrated by al-Bukhari and Muslim.",
    },
    {
      id: "dhikr-affliction",
      keywords: ["hardship", "trial", "affliction", "sick", "illness", "invocation of yunus", "dhikr yunus", "dhunnun"],
      question: "What to say during hardship or illness?",
      answer:
        "لَا إِلَٰهَ إِلَّا أَنْتَ سُبْحَانَكَ إِنِّي كُنْتُ مِنَ الظَّالِمِينَ — the supplication of the prophet Yunus, by which he was delivered from the belly of the whale. The Prophet ﷺ said no Muslim ever calls on it for a distress without Allah relieving it. Narrated by at-Tirmidhi.",
    },
    {
      id: "dhikr-salawat",
      keywords: ["salawat", "pray upon the prophet", "blessings upon the prophet"],
      question: "What is the merit of sending blessings on the Prophet (salawat)?",
      answer:
        "اللَّهُمَّ صَلِّ عَلَىٰ مُحَمَّدٍ — \"O Allah, send prayers upon Muhammad.\" Whoever sends one blessing upon the Prophet ﷺ, Allah sends ten blessings upon him in return. Narrated by Muslim.",
    },
  ],
  ar: [
    {
      id: "azkar-counter",
      keywords: ["اذكار", "عداد", "عد", "لمس", "دائرة", "ذكر", "تكرار"],
      question: "كيف أعد أذكاري؟",
      answer: "المس الدائرة الذهبية في وسط الشاشة عند كل ذكر. يتقدم العداد تلقائيًا وينتقل إلى الذكر التالي عند بلوغ العدد.",
    },
    {
      id: "azkar-categories",
      keywords: ["الصباح", "المساء", "النوم", "بعد الصلاة", "فئة", "الأذكار الأربع"],
      question: "ما الفرق بين فئات الأذكار الأربع؟",
      answer:
        "أذكار الصباح والمساء تُقرأ في هذين الوقتين، أذكار ما بعد الصلاة مباشرة بعد كل صلاة من الصلوات الخمس، وأذكار النوم قبل النوم. تجدها جميعًا في الشاشة الرئيسية.",
    },
    {
      id: "tasbih",
      keywords: ["تسبيح", "سبحة"],
      question: "كيف أستخدم التسبيح؟",
      answer: "علامة التبويب «تسبيح» أسفل الشاشة تفتح عدادًا حرًا: المس للعد، مثل سبحة إلكترونية. يمكنك إعادة ضبطه في أي وقت.",
    },
    {
      id: "quran-sourates",
      keywords: ["قرآن", "سورة", "سور", "آية", "آيات", "قراءة", "ترجمة"],
      question: "كيف أقرأ سورة آية بآية مع ترجمتها؟",
      answer: "القرآن ← علامة التبويب «السور» ← اختر سورة. تظهر ترجمة كل آية أسفلها، ويمكنك لمس آية للاستماع إليها بصوت أحد القراء.",
    },
    {
      id: "quran-mushaf",
      keywords: ["مصحف", "صفحة", "صفحات", "ترجمة آية", "تفسير"],
      question: "كيف أرى ترجمة آية في المصحف (الصفحة المطبوعة)؟",
      answer: "القرآن ← علامة التبويب «المصحف» الذي يعرض القرآن كصفحة مطبوعة حقيقية. المس كلمة من آية: تظهر قائمة صغيرة بها زر ▶ للاستماع لهذه الآية فقط، وزر 🌐 لعرض ترجمتها.",
    },
    {
      id: "quran-reciters",
      keywords: ["قارئ", "قراء", "استماع", "تلاوة", "صوت"],
      question: "كيف أستمع إلى القرآن باستمرار بصوت أحد القراء؟",
      answer: "القرآن ← علامة التبويب «القراء» ← اختر صوتًا. تدخل إلى مساحته حيث يمكنك تشغيل أي سورة للاستماع المتواصل.",
    },
    {
      id: "quran-offline",
      keywords: ["دون اتصال", "تنزيل", "بدون إنترنت"],
      question: "هل يمكن قراءة القرآن دون اتصال بالإنترنت؟",
      answer: "نعم: في القرآن ← المصحف، يمكنك تنزيل الصفحات مسبقًا لقراءتها لاحقًا دون اتصال.",
    },
    {
      id: "qibla",
      keywords: ["القبلة", "اتجاه", "مكة", "الكعبة", "بوصلة"],
      question: "كيف أجد اتجاه القبلة؟",
      answer: "في الشاشة الرئيسية، المس «القبلة — اتجاه مكة». يستخدم التطبيق بوصلة الهاتف لإرشادك إلى الاتجاه الصحيح.",
    },
    {
      id: "nawafil",
      keywords: ["نوافل", "سنن"],
      question: "ما هي النوافل؟",
      answer: "تجمع النوافل الصلوات غير الواجبة التي يمكنك متابعتها من الشاشة الرئيسية، بالإضافة إلى الصلوات الخمس المفروضة.",
    },
    {
      id: "prayer-reminders",
      keywords: ["تذكير", "إشعار", "جرس", "تنبيه", "وقت الصلاة"],
      question: "كيف أفعّل أو أوقف تذكير صلاة معينة؟",
      answer: "في الشاشة الرئيسية، لكل صلاة جرس صغير تحت وقتها: المسه لتفعيل أو إيقاف تذكيرها بشكل منفرد.",
    },
    {
      id: "bilan",
      keywords: ["إحصائيات", "سجل", "تقدم", "متابعة"],
      question: "ما فائدة علامة التبويب «الإحصائيات»؟",
      answer: "تعرض علامة التبويب «الإحصائيات» سجلك: الأذكار المكتملة، سلسلة أيامك المتتالية، وتقدمك في القرآن.",
    },
    {
      id: "theme",
      keywords: ["المظهر", "داكن", "فاتح", "الوضع الليلي"],
      question: "كيف أبدّل إلى المظهر الداكن أو الفاتح؟",
      answer: "المس أيقونة القمر/الشمس أعلى الشاشة الرئيسية، أو اذهب إلى الإعدادات لاختيار فاتح أو داكن أو تلقائي (حسب هاتفك).",
    },
    {
      id: "language",
      keywords: ["اللغة", "الفرنسية", "الإنجليزية", "العربية"],
      question: "كيف أغيّر لغة التطبيق؟",
      answer: "المس أيقونة الكرة الأرضية أعلى الشاشة الرئيسية، أو اذهب إلى الإعدادات، للاختيار بين الفرنسية والإنجليزية والعربية.",
    },
    {
      id: "arabic-size",
      keywords: ["حجم النص", "الخط", "تكبير النص"],
      question: "كيف أكبّر النص العربي؟",
      answer: "في الإعدادات، يوجد إعداد لحجم النص العربي بعدة أحجام للاختيار.",
    },
    {
      id: "accent-color",
      keywords: ["اللون", "تخصيص"],
      question: "هل يمكن تغيير لون التطبيق؟",
      answer: "نعم، في الإعدادات يمكنك الاختيار من بين عدة ألوان لتخصيص التطبيق.",
    },
    {
      id: "backup",
      keywords: ["نسخ احتياطي", "استعادة", "تصدير", "استيراد", "هاتف جديد"],
      question: "كيف أحفظ بياناتي أو أستعيدها على هاتف جديد؟",
      answer: "في الإعدادات، يتيح لك قسم التصدير/الاستيراد حفظ بياناتك في ملف، ثم استعادتها على جهاز آخر.",
    },
    {
      id: "bookmark",
      keywords: ["إشارة مرجعية", "علامة", "متابعة القراءة"],
      question: "كيف أضع إشارة مرجعية في القرآن؟",
      answer: "في المصحف، المس أيقونة النجمة أسفل الصفحة لإضافتها إلى إشاراتك المرجعية — ستجدها من قائمة «الذهاب إلى…».",
    },
    {
      id: "support",
      keywords: ["مشكلة", "خطأ", "تعطل", "اتصال", "مساعدة", "دعم"],
      question: "لدي مشكلة في التطبيق، كيف أتواصل معكم؟",
      answer: "اذهب إلى الإعدادات ← تواصل معنا لمراسلتنا مباشرة عبر البريد الإلكتروني ووصف المشكلة.",
    },
    // معرفة الأذكار — نص منقول حرفيًا من صيغ التسبيح الموجودة في التطبيق
    // (حصن المسلم)، وليس نصًا مولّدًا، حتى تبقى نسبة الأحاديث دقيقة ومطابقة
    // لما يظهر فعلاً في شاشة التسبيح.
    {
      id: "best-dhikr",
      keywords: ["أفضل ذكر", "أفضل دعاء", "أفضل كلمة"],
      question: "ما هو أفضل الذكر؟",
      answer:
        "لَا إِلَٰهَ إِلَّا اللَّهُ — «لا معبود بحق إلا الله». أفضل الدعاء، كما قال النبي ﷺ، هو ما قاله هو والأنبياء من قبله. رواه الترمذي.",
    },
    {
      id: "dhikr-subhanallah",
      keywords: ["سبحان الله وبحمده", "خفيفتان على اللسان"],
      question: "ما فضل «سبحان الله وبحمده»؟",
      answer:
        "سُبْحَانَ اللَّهِ وَبِحَمْدِهِ — «تنزيه الله وحمده». كلمتان خفيفتان على اللسان، ثقيلتان في الميزان، حبيبتان إلى الرحمن. رواه البخاري ومسلم.",
    },
    {
      id: "dhikr-istighfar",
      keywords: ["استغفار", "استغفر", "التوبة"],
      question: "لماذا أُكثر من الاستغفار؟",
      answer:
        "أَسْتَغْفِرُ اللَّهَ — «أطلب مغفرة الله». كان النبي ﷺ، رغم عصمته، يستغفر الله أكثر من سبعين مرة في اليوم. رواه البخاري.",
    },
    {
      id: "dhikr-hawla-quwwata",
      keywords: ["كنز من كنوز الجنة", "لا حول ولا قوة"],
      question: "أي ذكر هو كنز من كنوز الجنة؟",
      answer:
        "لَا حَوْلَ وَلَا قُوَّةَ إِلَّا بِاللَّهِ — «لا حول ولا قوة إلا بالله». سمّاها النبي ﷺ كنزًا من كنوز الجنة. رواه البخاري ومسلم.",
    },
    {
      id: "dhikr-affliction",
      keywords: ["شدة", "مرض", "كرب", "دعاء يونس", "ذو النون"],
      question: "ماذا أقول عند الشدة أو المرض؟",
      answer:
        "لَا إِلَٰهَ إِلَّا أَنْتَ سُبْحَانَكَ إِنِّي كُنْتُ مِنَ الظَّالِمِينَ — دعاء النبي يونس عليه السلام، الذي نجّاه الله به من بطن الحوت. قال النبي ﷺ إنه ما دعا بها مسلم في شيء قط إلا استجاب الله له. رواه الترمذي.",
    },
    {
      id: "dhikr-salawat",
      keywords: ["الصلاة على النبي", "صلاة على النبي", "صل على محمد"],
      question: "ما فضل الصلاة على النبي؟",
      answer:
        "اللَّهُمَّ صَلِّ عَلَىٰ مُحَمَّدٍ — «اللهم صلِّ على محمد». من صلى على النبي ﷺ صلاة واحدة صلى الله عليه بها عشرًا. رواه مسلم.",
    },
  ],
};

function normalize(str) {
  return (str || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip Latin accents
    .replace(/[ً-ْ]/g, "") // strip Arabic tashkeel
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function getFaqEntries(lang) {
  return FAQ[lang] || FAQ.fr;
}

// Scores every entry by how many of its keywords (or its own question
// words) appear in the query, and returns the best match above a small
// relevance floor — or null so the caller can show a fallback message.
// Whole-word matching only (no substring `.includes()`) so short common
// words inside a keyword can't accidentally match unrelated queries — the
// earlier substring-based scoring once matched "quelle heure est-il au
// Japon" to an azkar question just because "quelle" and "est" happened to
// also appear in that FAQ entry's own question text.
export function findFaqAnswer(query, lang) {
  const entries = getFaqEntries(lang);
  const normQuery = normalize(query);
  if (!normQuery) return null;
  const queryWords = new Set(normQuery.split(" ").filter(Boolean));

  let best = null;
  let bestScore = 0;
  for (const entry of entries) {
    let score = 0;
    for (const kw of entry.keywords) {
      const kwWords = normalize(kw).split(" ").filter(Boolean);
      if (kwWords.length === 0) continue;
      if (kwWords.every((w) => queryWords.has(w))) score += kwWords.length;
    }
    if (score > bestScore) {
      bestScore = score;
      best = entry;
    }
  }
  return bestScore > 0 ? best : null;
}
