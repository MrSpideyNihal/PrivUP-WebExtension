/* GENERATED FILE - DO NOT EDIT.
 *
 * Mirror of core/tags/rulesets/*.json, which is the single definition of a
 * rule anywhere in this repo. Regenerate with:
 *
 *     python tools/sync_rulesets.py
 *
 * A test runs `--check` and fails if this file is out of date, so the
 * extension cannot quietly disagree with the CLI about what a policy says.
 *
 * To add or change a rule, edit the JSON. Never edit this file.
 */

export const RULE_SETS = {
  "generic": {
    "description": "GDPR-pattern red flags that apply to any service: how long data is kept, who it goes to, whether you are being profiled, and whether you can say no.",
    "metadata": {
      "note": "These rules describe patterns, not legal conclusions. A finding here means a user should read a clause, not that a company is breaking the law."
    },
    "name": "generic",
    "reference": "Regulation (EU) 2016/679 (GDPR), read as a set of general expectations rather than as a jurisdiction claim",
    "rules": [
      {
        "category": "data_retention",
        "id": "gdpr.retention.indefinite",
        "negations": [
          "\\b(?:do|does|shall|will|would) not (?:retain|keep|store|hold)\\b",
          "\\bnever (?:retain|keep|store)\\b",
          "['’ʼ]t\\b"
        ],
        "note": "Storage limitation requires data to be kept no longer than necessary for the stated purpose. 'Indefinitely' and 'perpetual' are the explicit failures of that principle.",
        "patterns": [
          "\\bindefinite(?:ly)?\\b",
          "\\bperpetu(?:al|ity)\\b",
          "\\bin perpetuity\\b",
          "\\bforever\\b",
          "\\bno (?:fixed |set |specific )?(?:retention|deletion) (?:period|schedule)\\b",
          "\\bwithout (?:any )?time limit\\b"
        ],
        "reason": "This service keeps your data indefinitely. There is no point at which it is deleted.",
        "reference": "GDPR Art. 5(1)(e), storage limitation",
        "requires": [
          "\\b(?:retain|keep|store|hold|preserve|maintain)\\w*\\b|\\bdata\\b|\\binformation\\b"
        ],
        "severity": "high"
      },
      {
        "category": "data_retention",
        "id": "gdpr.retention.vague",
        "negations": [
          "\\b\\d+\\s*(?:day|month|year)s?\\b",
          "['’ʼ]t\\b"
        ],
        "note": "Very common and not by itself alarming, which is why it is low. It becomes meaningful in combination: a service that will not say how long it keeps data and also shares it with third parties has told you very little. Real policies rarely say 'indefinitely'. Google says 'We keep some data until you delete your Google Account', which is a retention statement with none of the retention vocabulary a pattern list would guess.",
        "patterns": [
          "\\bas long as (?:is )?(?:reasonably )?necessary\\b",
          "\\bfor as long as (?:we|the company|required)\\b",
          "\\blong as needed\\b",
          "\\buntil you (?:delete|close|remove|deactivate)\\b",
          "\\bfor only as long as\\b",
          "\\bas long as we need\\b",
          "\\bretain\\w*\\b[^.]{0,40}\\buntil\\b",
          "\\bkeep\\w*\\b[^.]{0,40}\\buntil you\\b"
        ],
        "reason": "How long your data is kept is described only as 'as long as necessary', with no actual period given.",
        "reference": "GDPR Art. 13(2)(a), the retention period must be stated",
        "severity": "low"
      },
      {
        "category": "third_party_sharing",
        "id": "gdpr.sharing.sale",
        "negations": [
          "\\b(?:do|does|shall|will|would) not\\b",
          "\\bnever\\b",
          "\\bwe don'?t\\b",
          "\\bno(?:t)? (?:sell|rent|lease|trade)\\b",
          "['’ʼ]t\\b"
        ],
        "note": "The negation list matters more than the patterns here. Most policies mention selling data specifically in order to promise they do not: Fibe's live policy reads 'We do not sell, rent, lease your Personal Information to anybody and will never do so.'",
        "patterns": [
          "\\bsell\\w*\\b[^.]{0,40}\\b(?:personal (?:data|information)|your (?:data|information))\\b",
          "\\b(?:rent|lease|trade|monetis|monetiz)\\w*\\b[^.]{0,40}\\b(?:personal (?:data|information)|your (?:data|information))\\b",
          "\\bdata brokers?\\b"
        ],
        "reason": "This service sells or rents your personal information to other companies.",
        "reference": "GDPR Art. 6, lawful basis; Art. 13(1)(e), recipients",
        "severity": "high"
      },
      {
        "category": "third_party_sharing",
        "id": "gdpr.sharing.third_party",
        "negations": [
          "\\b(?:do|does|shall|will|would) not (?:share|disclose|sell|transfer|provide|give|make available|grant)\\b",
          "\\bnever (?:share|disclose|sell|provide)\\b",
          "\\b(?:required|compelled) by law\\b",
          "\\bcourt order\\b",
          "\\blaw enforcement\\b",
          "\\blegal obligation\\b",
          "['’ʼ]t\\b"
        ],
        "note": "Sharing is normal and often necessary; the reason line says what happens rather than accusing anyone. Legal-obligation disclosures are negated out because a policy cannot promise not to answer a court order. The verb list was too narrow. 'We work with third-party service providers' and 'We may receive information from advertisers and other data partners' are both disclosures a reader wants, and neither used a verb we matched.",
        "patterns": [
          "\\b(?:share|disclose|transfer|provide|sell|make available)\\w*\\b[^.]{0,60}\\b(?:third part|partner|affiliate|advertiser|vendor|service provider)\\w*\\b",
          "\\bthird[- ]part(?:y|ies)\\b[^.]{0,60}\\b(?:access|receive|obtain)\\w*\\b",
          "\\b(?:work with|engage|rely on)\\b[^.]{0,50}\\b(?:third[- ]part|service provider|partner|vendor|affiliate)\\w*\\b",
          "\\bwe (?:may )?(?:receive|obtain|get)\\b[^.]{0,50}\\bfrom\\b[^.]{0,40}\\b(?:partner|advertiser|data broker|third part)\\w*\\b",
          "\\b(?:group|affiliated|other .{0,12}) companies\\b",
          "\\bcredit (?:bureau|information compan)\\w*\\b",
          "\\bbusiness transfer\\w*\\b|\\bmerger\\b|\\backquisition\\b"
        ],
        "reason": "Your information is passed to third parties such as partners, affiliates or advertisers.",
        "reference": "GDPR Art. 13(1)(e), categories of recipients",
        "severity": "medium"
      },
      {
        "category": "tracking_profiling",
        "id": "gdpr.tracking.profiling",
        "negations": [
          "\\b(?:do|does|shall|will|would) not\\b",
          "\\bnever\\b",
          "\\bwithout profiling\\b",
          "['’ʼ]t\\b",
          "\\bprofile (?:picture|photo|name|image|pic)\\b"
        ],
        "note": "Automated decision-making is singled out by Art. 22 because it affects people without a human ever looking. In a lending context this is also how a credit decision gets made about someone with no recourse. Bare 'profile' was removed as a pattern: it matched 'add a profile picture' and 'Changing Your Profile Name And Picture', which are account settings, not profiling.",
        "patterns": [
          "\\bprofiling\\b",
          "\\bbehaviou?ral (?:data|analys|advertis|profil|target)\\w*\\b",
          "\\bautomated decision\\w*\\b",
          "\\balgorithm\\w*\\b[^.]{0,40}\\b(?:decid|determin|assess|score)\\w*\\b",
          "\\bscoring model\\b",
          "\\bcredit scor\\w+\\b",
          "\\bbuild\\w*\\b[^.]{0,30}\\bprofile\\w*\\b\\s+(?:of|about) you\\b",
          "\\buser profile\\w*\\b[^.]{0,40}\\b(?:advertis|target|infer)\\w*\\b"
        ],
        "reason": "This service builds a profile of your behaviour and uses it to make decisions about you.",
        "reference": "GDPR Art. 4(4), profiling; Art. 22, automated decision-making",
        "severity": "medium"
      },
      {
        "category": "tracking_profiling",
        "id": "gdpr.tracking.cross_site",
        "negations": [
          "\\b(?:do|does|shall|will|would) not\\b",
          "\\bnever\\b",
          "\\bblock\\w*\\b[^.]{0,30}\\btracking\\b",
          "\\bprevent\\w*\\b[^.]{0,30}\\btracking\\b",
          "['’ʼ]t\\b"
        ],
        "note": "Tracking that follows a user off the property is the thing people are least likely to expect and most likely to object to.",
        "patterns": [
          "\\bcross[- ]site\\b",
          "\\bacross (?:other |third[- ]party )?(?:websites?|apps?|services?|devices?)\\b",
          "\\b(?:device )?fingerprint\\w*\\b",
          "\\btracking pixels?\\b",
          "\\bweb beacons?\\b",
          "\\bthird[- ]party cookies\\b",
          "\\badvertising (?:identifier|ID)\\b"
        ],
        "reason": "You are tracked across other websites and apps, not just while using this one.",
        "reference": "GDPR Art. 5(1)(a), transparency; ePrivacy Directive Art. 5(3)",
        "severity": "medium"
      },
      {
        "category": "tracking_profiling",
        "id": "gdpr.tracking.targeted_ads",
        "negations": [
          "\\b(?:do|does|shall|will|would) not\\b",
          "\\bnever\\b",
          "\\bwe don'?t\\b",
          "\\bno (?:targeted )?(?:ads|advertising)\\b",
          "['’ʼ]t\\b"
        ],
        "note": "Art. 21(2) gives an unconditional right to object. Worth surfacing precisely because the opt-out usually exists but is buried.",
        "patterns": [
          "\\btargeted (?:advertis|market|ad)\\w*\\b",
          "\\b(?:interest|behaviou?r)[- ]based (?:advertis|ad)\\w*\\b",
          "\\bpersonalis(?:e|ed|ing) (?:ads?|advertis)\\w*\\b",
          "\\bpersonaliz(?:e|ed|ing) (?:ads?|advertis)\\w*\\b",
          "\\bad(?:vertising)? (?:network|partner)s?\\b"
        ],
        "reason": "Your data is used to target advertising at you.",
        "reference": "GDPR Art. 21(2), the right to object to direct marketing",
        "severity": "medium"
      },
      {
        "category": "model_training",
        "id": "ai.training_on_user_content",
        "negations": [
          "\\b(?:do|does|shall|will|would) not\\b",
          "\\bnever\\b",
          "\\bwe don'?t\\b",
          "\\bopt(?:ed)? out\\b",
          "\\bexclud\\w*\\b",
          "\\bwithout using your\\b",
          "['’ʼ]t\\b"
        ],
        "note": "This is the permission-purpose mismatch case: a camera permission granted so you can take a picture, and a policy elsewhere that quietly repurposes the picture as training data. Purpose limitation is the principle being stretched, and the granting of the permission is not where the user finds out.",
        "patterns": [
          "\\btrain\\w*\\b[^.]{0,60}\\b(?:models?|AI|artificial intelligence|machine learning|algorithms?|LLM)\\b",
          "\\b(?:models?|AI|machine learning|algorithms?)\\b[^.]{0,60}\\btrain\\w*\\b",
          "\\bimprove\\w*\\b[^.]{0,40}\\b(?:models?|AI|machine learning)\\b",
          "\\btraining data\\b"
        ],
        "reason": "What you upload here is used to train the company's AI models. Your photos, files or messages become training data.",
        "reference": "GDPR Art. 5(1)(b), purpose limitation",
        "severity": "high"
      },
      {
        "category": "consent",
        "id": "gdpr.consent.bundled",
        "note": "Consent by continued use is not consent under Art. 4(11). Live example: Fibe's policy reads 'By using the Application, you signify your consent to our use of cookies.'",
        "patterns": [
          "\\bby (?:using|accessing|continuing to use|downloading|installing|mere use)\\b[^.]{0,90}\\b(?:you (?:agree|consent|accept|acknowledge|indicate|understand)|signif\\w+ your consent)\\b",
          "\\bcontinued use\\b[^.]{0,60}\\b(?:constitutes?|signifies|means)\\b",
          "\\bdeemed to have (?:agreed|consented|accepted)\\b",
          "\\bexpressly and (?:unconditionally|irrevocably) (?:agree|consent)\\b"
        ],
        "reason": "Simply using the service is treated as your agreement. You are not actually being asked.",
        "reference": "GDPR Art. 4(11), consent must be freely given and unambiguous",
        "severity": "medium"
      },
      {
        "category": "unilateral_change",
        "id": "gdpr.change.unilateral",
        "note": "Live example: Kissht's terms read 'We reserve the right to update or modify the Terms of Use at any time, without prior notice, at our sole discretion.' Terms you agreed to once are not the terms you are held to later.",
        "patterns": [
          "\\b(?:modify|change|amend|update|revise)\\w*\\b[^.]{0,80}\\b(?:without (?:prior )?notice|at any time|sole discretion)\\b",
          "\\bwithout (?:prior )?notice\\b[^.]{0,60}\\b(?:modify|change|amend|update)\\w*\\b",
          "\\breserve the right to (?:modify|change|amend|update|revise)\\b"
        ],
        "reason": "The company can change these terms whenever it likes, without telling you first.",
        "reference": "GDPR Art. 12(1), transparency of changes",
        "requires": [
          "\\b(?:polic|terms?|agreement|condition)\\w*\\b"
        ],
        "severity": "medium"
      },
      {
        "category": "cross_border_transfer",
        "id": "gdpr.transfer.cross_border",
        "negations": [
          "\\b(?:do|does|shall|will|would) not transfer\\b",
          "\\bnever transfer\\b",
          "['’ʼ]t\\b"
        ],
        "note": "Not wrong in itself, and Chapter V exists to make it lawful. Reported so a user knows which legal system is actually protecting their data.",
        "patterns": [
          "\\btransfer\\w*\\b[^.]{0,60}\\b(?:outside|other countr|another countr|abroad|overseas)\\w*\\b",
          "\\bservers? (?:located|hosted|based) (?:in|outside)\\b",
          "\\bcross[- ]border (?:transfer|data)\\w*\\b",
          "\\binternational (?:data )?transfers?\\b"
        ],
        "reason": "Your data is sent to servers in other countries, where different privacy laws apply.",
        "reference": "GDPR Chapter V, transfers to third countries",
        "severity": "medium"
      },
      {
        "category": "security",
        "id": "gdpr.security.disclaimed",
        "note": "Near-universal boilerplate and honest in its way, which is why it is low rather than medium. Included so the absence of it is also visible.",
        "patterns": [
          "\\b(?:cannot|can not|can'?t|no|not) (?:guarantee|ensure|warrant)\\w*\\b[^.]{0,60}\\b(?:secur|safe|protect)\\w*\\b",
          "\\bno method of (?:transmission|storage)\\b[^.]{0,60}\\b(?:100%|completely|entirely) secure\\b",
          "\\bat your own risk\\b"
        ],
        "reason": "The company states it cannot guarantee your data is secure.",
        "reference": "GDPR Art. 32, security of processing",
        "severity": "low"
      },
      {
        "category": "consent",
        "id": "gdpr.optout.absent",
        "note": "Absence is the finding, so this rule is document-scoped: no individual clause is wrong, the document as a whole is missing something a reader needs. Art. 7(3) requires withdrawing consent to be as easy as giving it, which is impossible if the policy never says how.",
        "patterns": [
          "\\bopt[- ]?out\\b",
          "\\bopt[- ]?in\\b",
          "\\b(?:withdraw|revoke|rescind)\\w*\\b[^.]{0,60}\\bconsent\\b",
          "\\bconsent\\b[^.]{0,60}\\b(?:withdraw|revoke)\\w*\\b",
          "\\bunsubscribe\\b",
          "\\bdelete (?:your|the) (?:account|data|personal (?:data|information))\\b",
          "\\bright to (?:erasure|be forgotten|object|deletion)\\b",
          "\\bdata deletion\\b",
          "\\bdisable (?:cookies|tracking)\\b"
        ],
        "reason": "This policy never explains how to opt out, withdraw consent, or delete your data. There is no stated way to say no.",
        "reference": "GDPR Art. 7(3), the right to withdraw consent; Art. 17, erasure",
        "scope": "document_absent",
        "severity": "high"
      }
    ]
  },
  "loan_app": {
    "description": "Digital lending apps in India, against RBI's Digital Lending Directions 2025 and the cost terms a borrower is entitled to see before agreeing.",
    "metadata": {
      "dla_directory": {
        "description": "Cross-reference the lender against RBI's public Digital Lending App directory, live since 01 Nov 2025. Not implemented in this phase. The hook is called and its None result recorded on every finding so that wiring it up later changes no other module.",
        "hook": "core.tags.dla_directory.lookup",
        "source": "https://www.rbi.org.in",
        "status": "stub"
      },
      "permitted_one_time_permissions": [
        "camera",
        "microphone",
        "location"
      ],
      "prohibited_phone_resources": [
        "files and media",
        "contact list",
        "call logs",
        "telephony functions"
      ],
      "regulator": "Reserve Bank of India",
      "relevance": {
        "min_signals": 3,
        "note": "Advisory only. PrivUp never blocks a rule set from running against a target. Phrases are chosen to be specific to credit: bare 'interest' and bare 'credit' are deliberately excluded because 'legitimate interest', 'interest-based advertising' and 'credit card' appear in ordinary privacy policies and would make this notice useless.",
        "notice": "This does not look like a lending app or a loan agreement, so these RBI lending rules may not apply well here. The findings below are still shown, but read them with that in mind.",
        "signals": [
          "loan",
          "borrower",
          "lender",
          "lending",
          "emi",
          "repayment",
          "repay",
          "interest rate",
          "rate of interest",
          "creditworthiness",
          "credit risk",
          "credit score",
          "credit bureau",
          "nbfc",
          "disburse",
          "principal amount",
          "foreclosure",
          "annual percentage rate"
        ]
      }
    },
    "name": "loan_app",
    "reference": "Reserve Bank of India (Digital Lending) Directions, 2025, issued 08 May 2025 (Notification 12848)",
    "rules": [
      {
        "category": "disallowed_permission",
        "hedge_reason": "This lender only says it 'tries' not to read your contacts. That is a soft promise, not a commitment, and RBI requires a hard one.",
        "hedge_severity": "high",
        "hedges": [
          "\\bideally\\b",
          "\\bgenerally\\b",
          "\\bordinarily\\b",
          "\\bendeavou?r\\b",
          "\\bwherever possible\\b",
          "\\bto the extent (?:possible|practicable)\\b",
          "\\bas far as possible\\b",
          "\\bstrive to\\b"
        ],
        "id": "rbi.permission.contacts",
        "metadata": {
          "android_permission": "READ_CONTACTS"
        },
        "negations": [
          "\\b(?:do|does|shall|will|would|can) ?n(?:o|')t\\b",
          "\\b(?:do|does|shall|will|would) not\\b",
          "\\bdesist from\\b",
          "\\bnever\\b",
          "\\bno longer\\b",
          "\\bwithout accessing\\b",
          "\\bnot (?:access|collect|read|store|retain|seek)\\b",
          "\\brefrain from\\b",
          "['’ʼ]t\\b"
        ],
        "note": "Para 12(i) requires DLAs to 'desist from accessing mobile phone resources like file and media, contact list, call logs, telephony functions'. Harvesting contacts is the mechanism behind recovery-agent harassment of a borrower's family and colleagues, which is why this is critical rather than merely high. The patterns deliberately exclude 'contact details' and 'contact information': those mean the borrower's own phone number and address, which every lender legitimately collects. Matching them flagged TrueBalance for the sentence 'The e-mail address, contact details provided by you ... may be used to ... intimate you the due date of payments', which is not a phone-book grab by any reading. The verb pattern allows one device word before 'contacts': 'access your device contacts' and 'read your phone contacts' are ordinary phrasings that an adjacent-words-only pattern silently missed.",
        "patterns": [
          "\\bcontacts? list\\b",
          "\\blist of (?:your )?contacts\\b",
          "\\bphone ?book\\b",
          "\\baddress book\\b",
          "\\b(?:access|read|collect|upload|scan|fetch|retrieve|harvest|sync)\\w*\\s+(?:to\\s+)?(?:your |the |all )?(?:device |phone |mobile |saved |stored |personal )?contacts\\b",
          "\\bcontacts?\\s+(?:on|from|stored (?:on|in))\\s+(?:your |the )?(?:phone|device|mobile|handset)\\b"
        ],
        "reason": "This lender says it reads your phone contacts. RBI does not permit lending apps to access your contact list.",
        "reference": "RBI Digital Lending Directions 2025, Para 12(i)",
        "severity": "critical"
      },
      {
        "category": "disallowed_permission",
        "hedge_reason": "This lender only says it 'tries' not to read your call logs. RBI requires a firm commitment, not a preference.",
        "hedge_severity": "high",
        "hedges": [
          "\\bideally\\b",
          "\\bgenerally\\b",
          "\\bordinarily\\b",
          "\\bendeavou?r\\b",
          "\\bwherever possible\\b",
          "\\bto the extent (?:possible|practicable)\\b"
        ],
        "id": "rbi.permission.call_logs",
        "metadata": {
          "android_permission": "READ_CALL_LOG"
        },
        "negations": [
          "\\b(?:do|does|shall|will|would|can) ?n(?:o|')t\\b",
          "\\b(?:do|does|shall|will|would) not\\b",
          "\\bdesist from\\b",
          "\\bnever\\b",
          "\\bnot (?:access|collect|read|store|retain|seek)\\b",
          "\\brefrain from\\b",
          "['’ʼ]t\\b"
        ],
        "note": "Named explicitly in Para 12(i) alongside contact list and telephony functions.",
        "patterns": [
          "\\bcall logs?\\b",
          "\\bcall (?:history|records?|details?|data)\\b",
          "\\btelephony functions?\\b"
        ],
        "reason": "This lender says it reads your call logs. RBI does not permit lending apps to access call history.",
        "reference": "RBI Digital Lending Directions 2025, Para 12(i)",
        "severity": "critical"
      },
      {
        "category": "disallowed_permission",
        "hedge_reason": "This lender reads your SMS but says the access is limited. You are trusting that limit; nothing on your phone enforces it.",
        "hedge_severity": "high",
        "hedges": [
          "\\bone[- ]?time\\b",
          "\\btransaction(?:al)? SMS\\b",
          "\\bfinancial(?:/ ?transaction)? SMS\\b",
          "\\bonly (?:financial|transaction|OTP)\\w*\\b",
          "\\bSMS\\b[^.]{0,40}\\bonly for\\b"
        ],
        "id": "rbi.permission.sms",
        "metadata": {
          "android_permission": "READ_SMS"
        },
        "negations": [
          "\\b(?:do|does|shall|will|would|can) ?n(?:o|')t\\b",
          "\\b(?:do|does|shall|will|would) not\\b",
          "\\bdesist from\\b",
          "\\bnever\\b",
          "\\bnot (?:access|collect|read|store|retain|seek)\\b",
          "\\brefrain from\\b",
          "\\bOTP\\b",
          "\\bone[- ]time password\\b",
          "\\bsend you\\b",
          "\\bsend(?:ing)? (?:you |an )?(?:SMS|text)\\b",
          "['’ʼ]t\\b"
        ],
        "note": "SMS is not named word-for-word in Para 12(i), but the paragraph closes with 'etc.' after listing phone resources, and reading a borrower's messages is plainly outside the camera/microphone/location carve-out for onboarding and KYC. TrueBalance's live policy states it will 'access all your SMS'; LazyPay's states it transmits SMS log data to its own servers. Flagged critical, with the reference wording kept honest about the reasoning.",
        "patterns": [
          "\\bSMS\\b",
          "\\btext messages?\\b",
          "\\bmessage (?:log|inbox|history)\\b",
          "\\bread (?:your )?messages\\b"
        ],
        "reason": "This lender says it reads your text messages. Your SMS inbox is not something a loan app is permitted to take.",
        "reference": "RBI Digital Lending Directions 2025, Para 12(i)",
        "requires": [
          "\\b(?:access|read|collect|scan|monitor|transmit|fetch|retrieve|upload|analyse|analyze|store)\\w*\\b"
        ],
        "severity": "critical"
      },
      {
        "category": "disallowed_permission",
        "hedge_reason": "This lender reaches into your phone storage and says it only takes the documents you choose. Nothing on your phone holds it to that.",
        "hedge_severity": "medium",
        "hedges": [
          "\\bideally\\b",
          "\\bgenerally\\b",
          "\\bonly (?:to|for|the)\\b",
          "\\bupload (?:your )?(?:KYC|document)\\w*\\b"
        ],
        "id": "rbi.permission.files_media",
        "metadata": {
          "android_permission": "READ_EXTERNAL_STORAGE"
        },
        "negations": [
          "\\b(?:do|does|shall|will|would|can) ?n(?:o|')t\\b",
          "\\b(?:do|does|shall|will|would) not\\b",
          "\\bdesist from\\b",
          "\\bnever\\b",
          "\\bnot (?:access|collect|read|store|retain|seek)\\b",
          "\\brefrain from\\b",
          "\\bcloud storage\\b",
          "\\bdata storage\\b",
          "\\bstorage and security\\b",
          "['’ʼ]t\\b"
        ],
        "note": "'file and media' is the first item named in Para 12(i). Bare 'storage' was removed: it fired on 'collection, usage, storage, sharing', on a security-measures sentence, and inside a definition of the word 'Processing'. Phone storage access needs a device word next to it.",
        "patterns": [
          "\\bfiles? and media\\b",
          "\\bmedia files?\\b",
          "\\bphoto (?:gallery|library)\\b",
          "\\bgallery\\b",
          "\\b(?:external|device|phone|internal|on-device|local) storage\\b",
          "\\bstorage permission\\b",
          "\\bimages? (?:stored|on your (?:device|phone))\\b"
        ],
        "reason": "This lender says it reads the files and photos on your phone. RBI does not permit lending apps to access your storage.",
        "reference": "RBI Digital Lending Directions 2025, Para 12(i)",
        "requires": [
          "\\b(?:access|read|collect|scan|upload|retrieve|fetch|browse)\\w*\\b"
        ],
        "severity": "critical"
      },
      {
        "category": "disallowed_permission",
        "id": "rbi.permission.installed_apps",
        "metadata": {
          "android_permission": "QUERY_ALL_PACKAGES"
        },
        "negations": [
          "\\b(?:do|does|shall|will|would|can) ?n(?:o|')t\\b",
          "\\b(?:do|does|shall|will|would) not\\b",
          "\\bnever\\b",
          "\\bnot (?:access|collect|read|store|retain)\\b",
          "['’ʼ]t\\b"
        ],
        "note": "Not named in Para 12(i), but it fails the same need-based test, and the installed-app list is routinely used to infer whether a borrower is using competing lenders. High rather than critical because it is an inference from the principle rather than a listed item.",
        "patterns": [
          "\\binstalled (?:apps?|applications?)\\b",
          "\\blist of (?:apps?|applications?)\\b",
          "\\bapps? installed on\\b"
        ],
        "reason": "This lender lists the other apps installed on your phone. That is a profile of you, and it is not needed to lend you money.",
        "reference": "RBI Digital Lending Directions 2025, Para 12(i)",
        "severity": "high"
      },
      {
        "category": "permission_scope",
        "id": "rbi.permission.one_time_unqualified",
        "metadata": {
          "android_permission": "CAMERA|RECORD_AUDIO|ACCESS_FINE_LOCATION"
        },
        "negations": [
          "\\bone[- ]time\\b",
          "\\bKYC\\b",
          "\\bon-?boarding\\b",
          "\\b(?:do|does|shall|will|would) not\\b",
          "\\bnever\\b",
          "\\bscan the QR\\b",
          "\\bopen your phone camera\\b",
          "['’ʼ]t\\b",
          "\\byou (?:can|may|are able to)\\b[^.]{0,40}\\b(?:modify|change|revoke|disable|turn off|manage|control)\\b",
          "\\bmodify permissions\\b",
          "\\bin your (?:device |phone )?settings\\b"
        ],
        "note": "Para 12(i) permits 'a one-time access [...] for camera, microphone, location or any other facility necessary for the purpose of on-boarding/ KYC requirements only, with the explicit consent of the borrower'. So these permissions are not themselves a violation; taking them open-endedly is. The negations here are the qualifiers that make the access lawful, which is why they read as positives. The one-time negation allows the unhyphenated spelling: Kissht's live policy writes 'onetime access', and requiring a hyphen made the qualifier invisible. The patterns name the device facility explicitly rather than pairing a verb with a nearby noun. A loose gap pattern matched 'Kissht reserves the right to modify the User Interface, appearance, contents, organization, location and accessibility of the Website', where 'location' means where things sit on a page and 'accessibility' merely begins with 'access'. 'For example, you can modify permissions on your Android device for access to Camera' is an instruction for protecting yourself and was being reported as a risk.",
        "patterns": [
          "\\b(?:camera|microphone|geo-?location|GPS)\\b",
          "\\blocation (?:data|permission|access|services?|tracking)\\b"
        ],
        "reason": "This lender takes camera, microphone or location access without saying it is one-time and only for KYC. RBI allows these only on that basis.",
        "reference": "RBI Digital Lending Directions 2025, Para 12(i)",
        "requires": [
          "\\b(?:access|permission|consent|grant|collect|enable|capture|record)\\w*\\b"
        ],
        "severity": "medium"
      },
      {
        "category": "cost_of_credit",
        "id": "rbi.charges.interest_high",
        "note": "Threshold set at 24% p.a. This is not a legal ceiling. RBI does not cap NBFC personal-loan rates; it requires the all-in Annual Percentage Rate to be disclosed in the Key Fact Statement. 24% is roughly double a mainstream bank personal loan and is the point at which a borrower should be made to look twice. Live example: Kissht's terms state 'Rate of Interest (%) Up to 36% p.a.'",
        "numeric": {
          "kind": "percent_annual",
          "operator": ">=",
          "threshold": 24.0
        },
        "patterns": [
          "\\b(?:rate of interest|interest rate|APR|annual(?:ised|ized)? percentage rate)\\b",
          "\\d+(?:\\.\\d+)?\\s*%\\s*(?:p\\.?a\\.?|per annum)"
        ],
        "reason": "The interest rate on this loan is up to {value}% a year. Check the total amount repayable before you agree.",
        "reference": "RBI Digital Lending Directions 2025, Chapter III (Key Fact Statement and Annual Percentage Rate)",
        "severity": "high"
      },
      {
        "category": "cost_of_credit",
        "id": "rbi.charges.penal_daily",
        "note": "The reason this rule exists. Kissht's schedule of charges reads 'Daily charges of up to 0.2% of the overdue principal amount', which annualises to roughly 73%. Quoting a rate per day rather than per year is the single most effective way to make an expensive debt look cheap, and no keyword rule notices it. The analyzer annualises before comparing against the threshold.",
        "numeric": {
          "kind": "percent_daily",
          "operator": ">=",
          "threshold": 36.0
        },
        "patterns": [
          "\\bdaily (?:charge|rate|interest|penal)\\w*\\b",
          "\\bper day\\b",
          "\\bcharges? (?:of|up to)[^.]{0,40}per day\\b"
        ],
        "reason": "Late payment is charged daily, which works out to about {annualised}% a year. A rate quoted per day hides how fast this debt grows.",
        "reference": "RBI Digital Lending Directions 2025, Chapter III (Key Fact Statement and Annual Percentage Rate)",
        "requires": [
          "\\d+(?:\\.\\d+)?\\s*%"
        ],
        "severity": "critical"
      },
      {
        "category": "cost_of_credit",
        "id": "rbi.charges.non_refundable_fee",
        "note": "Live example: Kissht's terms state 'Processing Fee is non-refundable charges and would not be waived/ refunded in case of loan cancellation or where the loan has not been disbursed.' A fee that survives a loan never being disbursed is a real, and commonly unnoticed, cost.",
        "patterns": [
          "\\bnon[- ]refundable\\b",
          "\\bnot be (?:refunded|waived|reimbursed)\\b",
          "\\bshall not be refunded\\b"
        ],
        "reason": "The processing fee is non-refundable. You pay it even if the loan is cancelled or never paid out.",
        "reference": "RBI Digital Lending Directions 2025, Chapter III (cooling-off period)",
        "requires": [
          "\\b(?:fee|charge|amount|processing)\\w*\\b"
        ],
        "severity": "high"
      },
      {
        "category": "cost_of_credit",
        "id": "rbi.charges.processing_fee",
        "negations": [
          "\\d+(?:\\.\\d+)?\\s*%\\s*of (?:the )?processing fees?\\b",
          "['’ʼ]t\\b"
        ],
        "note": "Live example: Kissht's terms state 'Processing fees | Up to 7%'. Borrowers routinely read the loan amount as the amount they will receive.",
        "numeric": {
          "kind": "percent_any",
          "operator": ">=",
          "threshold": 2.0
        },
        "patterns": [
          "\\bprocessing (?:fee|charge)s?\\b"
        ],
        "reason": "A processing fee of up to {value}% is taken off the top, so you receive less than the loan amount.",
        "reference": "RBI Digital Lending Directions 2025, Chapter III (Key Fact Statement)",
        "requires": [
          "\\d+(?:\\.\\d+)?\\s*%|(?:Rs\\.?|INR|₹)\\s*[\\d,]+"
        ],
        "severity": "medium"
      },
      {
        "category": "cost_of_credit",
        "id": "rbi.charges.cooling_off_charged",
        "negations": [
          "\\bno (?:charge|fee|penalt)\\w*\\b",
          "\\bfree of (?:charge|cost)\\b",
          "\\bnil\\b",
          "\\bwithout (?:any )?(?:charge|fee|penalt)\\w*\\b",
          "\\bshall not apply\\b",
          "['’ʼ]t\\b"
        ],
        "note": "Found by reading a real schedule of charges rather than by reasoning about the regulation. Kissht's terms read '3 days Charges: up to 100% of processing fees may be levied for loan foreclosure during the cooling off period'. The cooling-off period is a borrower protection RBI mandates; charging the full processing fee inside it takes most of the protection back, and a borrower reading the word 'cooling-off' would reasonably assume otherwise.",
        "patterns": [
          "\\bcooling[- ]off\\b",
          "\\blook[- ]up period\\b"
        ],
        "reason": "You are charged even if you back out during the cooling-off period. The window that is supposed to let you exit free is not free.",
        "reference": "RBI Digital Lending Directions 2025, Chapter III (cooling-off / look-up period)",
        "requires": [
          "\\b(?:charge|fee|levie|levy|penalt)\\w*\\b"
        ],
        "severity": "high"
      },
      {
        "category": "cost_of_credit",
        "id": "rbi.charges.foreclosure_penalty",
        "negations": [
          "\\bno (?:foreclosure|prepayment) (?:charge|fee|penalt)\\w*\\b",
          "\\bnil\\b",
          "['’ʼ]t\\b"
        ],
        "note": "Live example: Kissht's terms state 'Foreclosure and part prepayment charges | Up to 7% of amount foreclosed/ prepaid'.",
        "patterns": [
          "\\bforeclosure (?:charge|fee|penalt)\\w*\\b",
          "\\b(?:pre)?payment (?:charge|penalt)\\w*\\b",
          "\\bpart prepayment charges?\\b"
        ],
        "reason": "You are charged a penalty for repaying early. Clearing this loan ahead of schedule costs extra.",
        "reference": "RBI Digital Lending Directions 2025, Chapter III (Key Fact Statement)",
        "severity": "medium"
      },
      {
        "category": "cost_of_credit",
        "id": "rbi.charges.undisclosed",
        "note": "Open-ended cost language is what a Key Fact Statement exists to prevent. 'As applicable' is not a price.",
        "patterns": [
          "\\bcharges? as applicable\\b",
          "\\bas may be (?:determined|decided|applicable|prescribed)\\b",
          "\\bsubject to change without (?:prior )?notice\\b",
          "\\bother charges? (?:may|shall|will) (?:apply|be levied)\\b",
          "\\bat (?:our|its|the (?:company|lender)'s) sole discretion\\b"
        ],
        "reason": "Charges here are left open-ended, so the lender can change what you owe without telling you a figure now.",
        "reference": "RBI Digital Lending Directions 2025, Chapter III (all-inclusive cost disclosure)",
        "requires": [
          "\\b(?:charge|fee|rate|interest|amount|cost|price)\\w*\\b"
        ],
        "severity": "high"
      },
      {
        "category": "recovery_practice",
        "id": "rbi.recovery.third_party_agents",
        "negations": [
          "\\b(?:do|does|shall|will|would) not\\b",
          "\\bnever\\b",
          "['’ʼ]t\\b"
        ],
        "note": "Recovery-agent contact combined with any contact-harvesting finding is the pattern behind the harassment cases now before the courts. Scored on its own here; the scorer is what escalates the combination.",
        "patterns": [
          "\\brecovery agen\\w+\\b",
          "\\bcollection agen\\w+\\b",
          "\\bdebt collect\\w+\\b",
          "\\brepossession agen\\w+\\b"
        ],
        "reason": "Recovery is handed to third-party agents, and this policy shares your details with them.",
        "reference": "RBI Digital Lending Directions 2025, Chapter II (conduct and recovery)",
        "severity": "high"
      },
      {
        "category": "consent",
        "id": "rbi.consent.no_withdrawal",
        "note": "Para 12(ii) entitles a borrower to 'revoke consent already granted to collect personal data and if required, make the RE/LSP delete/ forget the data'. Absence is the finding here, which is why this rule is document-scoped: no single clause is wrong, the document as a whole is missing something it is required to contain.",
        "patterns": [
          "\\b(?:withdraw|revoke|rescind)\\w*\\b[^.]{0,60}\\bconsent\\b",
          "\\bconsent\\b[^.]{0,60}\\b(?:withdraw|revoke)\\w*\\b",
          "\\bdelete (?:your|the) (?:data|personal (?:data|information))\\b",
          "\\bright to (?:erasure|be forgotten|deletion)\\b",
          "\\bdata deletion\\b",
          "\\bforget the data\\b"
        ],
        "reason": "This policy never explains how to withdraw your consent or have your data deleted. RBI requires a lender to offer both.",
        "reference": "RBI Digital Lending Directions 2025, Para 12(ii)",
        "scope": "document_absent",
        "severity": "high"
      },
      {
        "category": "transparency",
        "id": "rbi.disclosure.no_lender_named",
        "note": "A lending service provider must disclose the regulated entity behind the loan up front. An app that does not name one is either an unregulated lender or hiding a regulated one, and both matter to a borrower.",
        "patterns": [
          "\\bNBFC\\b",
          "\\bnon[- ]banking financial (?:company|companies)\\b",
          "\\bregulated entit(?:y|ies)\\b",
          "\\bRBI[- ]registered\\b",
          "\\blending partner\\b",
          "\\bour lending partners?\\b",
          "\\bregistered with the Reserve Bank\\b"
        ],
        "reason": "This app never names the regulated bank or NBFC actually lending the money. You are entitled to know who your lender is.",
        "reference": "RBI Digital Lending Directions 2025, Chapter II (disclosure of Regulated Entity)",
        "scope": "document_absent",
        "severity": "high"
      },
      {
        "category": "consent",
        "id": "rbi.consent.bundled",
        "negations": [
          "\\bopt[- ]?in\\b",
          "['’ʼ]t\\b"
        ],
        "note": "Para 12(i) requires collection to be 'with prior and explicit consent of the borrower having audit trail'. Consent inferred from opening the app is neither prior nor explicit. Kissht's live policy reads 'By mere use of the Platform(s), you expressly and unconditionally agree'.",
        "patterns": [
          "\\bby (?:mere )?(?:use|using|accessing|downloading|installing)\\b[^.]{0,90}\\b(?:you (?:agree|consent|accept|acknowledge|indicate)|signif\\w+ your consent)\\b",
          "\\bexpressly and (?:unconditionally|irrevocably) (?:agree|consent)\\b",
          "\\bdeemed to have (?:agreed|consented|accepted)\\b"
        ],
        "reason": "Just using this app is treated as your agreement. RBI requires a lender to ask you explicitly.",
        "reference": "RBI Digital Lending Directions 2025, Para 12(i)",
        "severity": "high"
      }
    ]
  }
};
