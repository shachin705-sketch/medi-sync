// Bilingual Translations (English & Tamil) for MediSync PHC
export const translations = {
  en: {
    app_title: 'MediSync PHC',
    app_subtitle: 'Tamil Nadu Public Health Medicine Stock & Redistribution Network',
    district_name: 'Chengalpattu District',
    select_role: 'Select Persona / Role',
    lang_toggle: 'தமிழ் (Tamil)',

    // Roles
    role_pharmacist: 'Pharmacist',
    role_mo: 'Medical Officer',
    role_bmo: 'Block Medical Officer',
    role_admin: 'District Admin',
    role_public: 'Citizen / Public',

    // Navigation
    nav_dashboard: 'Dashboard',
    nav_stock_list: 'Medicine Stock',
    nav_stock_entry: 'Daily Entry',
    nav_nearby_finder: 'Nearby Surplus Finder',
    nav_transfers: 'Transfers & Indents',
    nav_ai_insights: 'AI Forecast & Insights',
    nav_reports: 'Reports & Risk Map',
    nav_chatbot: 'Staff AI Chatbot',
    nav_public: 'Public Checker',

    // Statuses
    status_green: 'Optimal (>30 days)',
    status_amber: 'Low Buffer (15-30 days)',
    status_red: 'Critical Shortage (<15 days)',
    status_out: 'Out of Stock',
    cold_chain: 'Cold-Chain (2-8°C)',
    critical_medicine: 'Life-Saving Critical',

    // Actions
    btn_request_transfer: 'Request Transfer',
    btn_submit_entry: 'Save Daily Stock',
    btn_approve: 'Approve',
    btn_dispatch: 'Mark In Transit',
    btn_receive: 'Confirm Receipt',
    btn_print_slip: 'Print Transfer Slip',
    btn_find_surplus: 'Find Nearby Surplus',
    btn_draft_indent: 'Draft Emergency Indent',
    btn_sync_now: 'Sync Offline Queue',

    // Stock List Headers
    col_medicine: 'Medicine & Strength',
    col_category: 'Category',
    col_current_stock: 'Current Stock',
    col_adc: 'Avg Daily Use (7d)',
    col_days_left: 'Days Remaining',
    col_trend: 'Trend Velocity',
    col_actions: 'Actions',

    // Transfers
    trf_requested: 'Requested',
    trf_approved: 'Approved',
    trf_transit: 'In Transit',
    trf_received: 'Received',
    trf_completed: 'Completed',

    // Nearby Finder
    distance_km: 'Distance (km)',
    travel_time: 'Est. Road Travel',
    surplus_available: 'Spareable Surplus',
    source_centre: 'Surplus Health Centre',

    // Offline status
    offline_badge: 'Offline Mode Active',
    online_badge: 'Connected to District Hub'
  },
  ta: {
    app_title: 'மெடிசின்க் (MediSync) ஆரம்ப சுகாதார நிலையம்',
    app_subtitle: 'தமிழ்நாடு பொது சுகாதாரத் துறை மருந்து இருப்பு கண்காணிப்பு மற்றும் பகிர்வு வலைப்பின்னல்',
    district_name: 'செங்கல்பட்டு மாவட்டம்',
    select_role: 'பயனர் பொறுப்பைத் தேர்வு செய்க',
    lang_toggle: 'English',

    // Roles
    role_pharmacist: 'மருந்தாளுநர் (PHC)',
    role_mo: 'மருத்துவ அலுவலர் (MO)',
    role_bmo: 'வட்டார மருத்துவ அலுவலர் (BMO)',
    role_admin: 'மாவட்ட சுகாதார நிர்வாகி (DDHS)',
    role_public: 'பொதுமக்கள் (Public)',

    // Navigation
    nav_dashboard: 'முகப்பு கட்டுப்பாட்டகம்',
    nav_stock_list: 'மருந்து இருப்பு பட்டியல்',
    nav_stock_entry: 'தினசரி இருப்பு பதிவு',
    nav_nearby_finder: 'அருகிலுள்ள உபரி தேடல்',
    nav_transfers: 'இடமாற்றம் & அவசர கோரிக்கை',
    nav_ai_insights: 'செயற்கை நுண்ணறிவு முன்கணிப்பு',
    nav_reports: 'அறிக்கைகள் & இடர் வரைபடம்',
    nav_chatbot: 'AI மருத்துவ உதவியாளர்',
    nav_public: 'பொது மக்கள் இருப்பு சரிபார்ப்பு',

    // Statuses
    status_green: 'போதுமான இருப்பு (>30 நாட்கள்)',
    status_amber: 'குறைந்த இருப்பு (15-30 நாட்கள்)',
    status_red: 'அவசர பற்றாக்குறை (<15 நாட்கள்)',
    status_out: 'இருப்பில் இல்லை',
    cold_chain: 'குளிர்சங்கிலி பராமரிப்பு (2-8°C)',
    critical_medicine: 'உயிர்காக்கும் அத்தியாவசிய மருந்து',

    // Actions
    btn_request_transfer: 'இடமாற்ற கோரிக்கை வை',
    btn_submit_entry: 'இருப்பைச் சேமிக்கவும்',
    btn_approve: 'ஒப்புதல் அளி',
    btn_dispatch: 'வாகனம் புறப்பட்டது',
    btn_receive: 'மருந்து பெறப்பட்டது',
    btn_print_slip: 'பரிமாற்ற சீட்டு அச்சிடு',
    btn_find_surplus: 'அருகிலுள்ள உபரி தேடு',
    btn_draft_indent: 'அவசர கொள்முதல் கோரிக்கை',
    btn_sync_now: 'ஆஃப்லைன் தரவை ஒத்திசை',

    // Stock List Headers
    col_medicine: 'மருந்து & அளவு',
    col_category: 'மருத்துவப் பிரிவு',
    col_current_stock: 'தற்போதைய இருப்பு',
    col_adc: 'தினசரி பயன்பாடு (7 நாள்)',
    col_days_left: 'மீதமுள்ள நாட்கள்',
    col_trend: 'பயன்பாட்டு வேகம்',
    col_actions: 'நடவடிக்கை',

    // Transfers
    trf_requested: 'கோரப்பட்டது',
    trf_approved: 'ஒப்புதல் அளிக்கப்பட்டது',
    trf_transit: 'கொண்டு செல்லப்படுகிறது',
    trf_received: 'பெறப்பட்டது',
    trf_completed: 'நிறைவுற்றது',

    // Nearby Finder
    distance_km: 'தொலைவு (கி.மீ)',
    travel_time: 'பயண நேரம்',
    surplus_available: 'கொடுக்கக்கூடிய உபரி',
    source_centre: 'உபரி உள்ள சுகாதார நிலையம்',

    // Offline status
    offline_badge: 'ஆஃப்லைன் பயன்முறை இயங்குகிறது',
    online_badge: 'இணைப்பு சீராக உள்ளது'
  }
};
