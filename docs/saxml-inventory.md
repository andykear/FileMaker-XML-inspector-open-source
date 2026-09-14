# SaXML inventory

One row per datum the legacy inspector reads from Save as XML (parser rows) or renders from the stats object (render rows).
Classification is one of `covered`, `derived`, `gap`. `fm` names the catalog and key that supplies it, or the register id for a gap.

| Source | Datum | Classification | fm | Notes |
|---|---|---|---|---|
| parseXMLToStats | qs:'parsererror' |  |  |  |
| buildDDRTextIndex | attr:'datatype' |  |  |  |
| buildDDRTextIndex | qsa:':scope > DDR_INFO' |  |  |  |
| buildDDRTextIndex | tag:'*' |  |  |  |
| parseFileMetadata | attr:'action' |  |  |  |
| parseFileMetadata | attr:'enable' |  |  |  |
| parseFileMetadata | attr:'keychain' |  |  |  |
| parseFileMetadata | attr:'name' |  |  |  |
| parseFileMetadata | attr:'type' |  |  |  |
| parseFileMetadata | attr:'version' |  |  |  |
| parseFileMetadata | qs:'Encryption' |  |  |  |
| parseFileMetadata | qs:'HideClientSharing' |  |  |  |
| parseFileMetadata | qs:'HideToolbars' |  |  |  |
| parseFileMetadata | qs:'HideWebDirectSharing' |  |  |  |
| parseFileMetadata | qs:'LayoutReference' |  |  |  |
| parseFileMetadata | qs:'Login' |  |  |  |
| parseFileMetadata | qs:'Metadata' |  |  |  |
| parseFileMetadata | qs:'Minimum' |  |  |  |
| parseFileMetadata | qs:'SavePassword' |  |  |  |
| parseFileMetadata | qs:'ScriptReference' |  |  |  |
| parseFileMetadata | qsa:'ScriptTrigger' |  |  |  |
| parseLibrary | qs:'LibraryCatalog' |  |  |  |
| parseLibrary | qsa:'BinaryData' |  |  |  |
| parseTablesAndFields | attr:'absolute' |  |  |  |
| parseTablesAndFields | attr:'comment' |  |  |  |
| parseTablesAndFields | attr:'datatype' |  |  |  |
| parseTablesAndFields | attr:'existing' |  |  |  |
| parseTablesAndFields | attr:'fieldtype' |  |  |  |
| parseTablesAndFields | attr:'global' |  |  |  |
| parseTablesAndFields | attr:'id' |  |  |  |
| parseTablesAndFields | attr:'index' |  |  |  |
| parseTablesAndFields | attr:'maxRepetitions' |  |  |  |
| parseTablesAndFields | attr:'name' |  |  |  |
| parseTablesAndFields | attr:'notEmpty' |  |  |  |
| parseTablesAndFields | attr:'prohibitModification' |  |  |  |
| parseTablesAndFields | attr:'storeCalculationResults' |  |  |  |
| parseTablesAndFields | attr:'type' |  |  |  |
| parseTablesAndFields | attr:'unique' |  |  |  |
| parseTablesAndFields | attr:'withFewerFolders' |  |  |  |
| parseTablesAndFields | qs:':scope > AutoEnter' |  |  |  |
| parseTablesAndFields | qs:':scope > BaseDirectoryReference' |  |  |  |
| parseTablesAndFields | qs:':scope > BaseTableReference' |  |  |  |
| parseTablesAndFields | qs:':scope > Calculation' |  |  |  |
| parseTablesAndFields | qs:':scope > ObjectList' |  |  |  |
| parseTablesAndFields | qs:':scope > Remote' |  |  |  |
| parseTablesAndFields | qs:':scope > Storage' |  |  |  |
| parseTablesAndFields | qs:':scope > Text' |  |  |  |
| parseTablesAndFields | qs:':scope > Validation' |  |  |  |
| parseTablesAndFields | qs:'BaseTableCatalog' |  |  |  |
| parseTablesAndFields | qs:'BaseTableReference' |  |  |  |
| parseTablesAndFields | qs:'Calculation' |  |  |  |
| parseTablesAndFields | qs:'FieldsForTables' |  |  |  |
| parseTablesAndFields | qs:'InRange' |  |  |  |
| parseTablesAndFields | qs:'Looked_up' |  |  |  |
| parseTablesAndFields | qs:'ObjectList' |  |  |  |
| parseTablesAndFields | qs:'TableOccurrenceReference' |  |  |  |
| parseTablesAndFields | qsa:':scope > BaseTable' |  |  |  |
| parseTablesAndFields | qsa:':scope > FieldCatalog' |  |  |  |
| parseTablesAndFields | qsa:':scope > Field[fieldtype]' |  |  |  |
| parseTablesAndFields | qsa:'FieldCatalog' |  |  |  |
| parseRelationships | attr:'TableOccurrenceReference' |  |  |  |
| parseRelationships | attr:'baseTable' |  |  |  |
| parseRelationships | attr:'blue' |  |  |  |
| parseRelationships | attr:'cascadeCreate' |  |  |  |
| parseRelationships | attr:'cascadeDelete' |  |  |  |
| parseRelationships | attr:'green' |  |  |  |
| parseRelationships | attr:'id' |  |  |  |
| parseRelationships | attr:'name' |  |  |  |
| parseRelationships | attr:'red' |  |  |  |
| parseRelationships | attr:'table' |  |  |  |
| parseRelationships | attr:'type' |  |  |  |
| parseRelationships | qs:':scope > LeftTable' |  |  |  |
| parseRelationships | qs:':scope > RightTable' |  |  |  |
| parseRelationships | qs:'BaseTableReference' |  |  |  |
| parseRelationships | qs:'Color' |  |  |  |
| parseRelationships | qs:'LeftField > FieldReference' |  |  |  |
| parseRelationships | qs:'RelationshipCatalog' |  |  |  |
| parseRelationships | qs:'RightField > FieldReference' |  |  |  |
| parseRelationships | qs:'SortSpecification' |  |  |  |
| parseRelationships | qs:'TableOccurrenceCatalog' |  |  |  |
| parseRelationships | qs:'TableOccurrenceReference' |  |  |  |
| parseRelationships | qsa:':scope > Relationship' |  |  |  |
| parseRelationships | qsa:':scope > TableOccurrence' |  |  |  |
| parseRelationships | qsa:'JoinPredicate' |  |  |  |
| parseLayouts | attr:'Display' |  |  |  |
| parseLayouts | attr:'Style' |  |  |  |
| parseLayouts | attr:'allowFormView' |  |  |  |
| parseLayouts | attr:'allowListView' |  |  |  |
| parseLayouts | attr:'allowTableView' |  |  |  |
| parseLayouts | attr:'defaultView' |  |  |  |
| parseLayouts | attr:'displayName' |  |  |  |
| parseLayouts | attr:'enable' |  |  |  |
| parseLayouts | attr:'hidden' |  |  |  |
| parseLayouts | attr:'id' |  |  |  |
| parseLayouts | attr:'isFolder' |  |  |  |
| parseLayouts | attr:'left' |  |  |  |
| parseLayouts | attr:'name' |  |  |  |
| parseLayouts | attr:'quickFind' |  |  |  |
| parseLayouts | attr:'right' |  |  |  |
| parseLayouts | attr:'rowLimit' |  |  |  |
| parseLayouts | attr:'rowsperpage' |  |  |  |
| parseLayouts | attr:'saveRecord' |  |  |  |
| parseLayouts | attr:'show' |  |  |  |
| parseLayouts | attr:'startrow' |  |  |  |
| parseLayouts | attr:'type' |  |  |  |
| parseLayouts | attr:'width' |  |  |  |
| parseLayouts | qs:':scope > Button' |  |  |  |
| parseLayouts | qs:':scope > Field' |  |  |  |
| parseLayouts | qs:':scope > LayoutThemeReference' |  |  |  |
| parseLayouts | qs:':scope > LocalCSS' |  |  |  |
| parseLayouts | qs:':scope > MenuSetReference' |  |  |  |
| parseLayouts | qs:':scope > Options' |  |  |  |
| parseLayouts | qs:':scope > PartsList' |  |  |  |
| parseLayouts | qs:':scope > Portal' |  |  |  |
| parseLayouts | qs:':scope > ScriptTriggers' |  |  |  |
| parseLayouts | qs:':scope > Table' |  |  |  |
| parseLayouts | qs:':scope > TableOccurrenceReference' |  |  |  |
| parseLayouts | qs:':scope > Theme' |  |  |  |
| parseLayouts | qs:':scope > Usage' |  |  |  |
| parseLayouts | qs:':scope > action' |  |  |  |
| parseLayouts | qs:'Bounds' |  |  |  |
| parseLayouts | qs:'ButtonBar > ObjectList' |  |  |  |
| parseLayouts | qs:'CustomMenuSetReference' |  |  |  |
| parseLayouts | qs:'Display' |  |  |  |
| parseLayouts | qs:'IconData' |  |  |  |
| parseLayouts | qs:'LayoutCatalog' |  |  |  |
| parseLayouts | qs:'ScriptReference' |  |  |  |
| parseLayouts | qs:'SlideControl > ObjectList' |  |  |  |
| parseLayouts | qs:'Step' |  |  |  |
| parseLayouts | qs:'TabControl > ObjectList' |  |  |  |
| parseLayouts | qs:'ThemeReference' |  |  |  |
| parseLayouts | qsa:'LayoutCatalog ScriptReference' |  |  |  |
| parseLayouts | qsa:'LayoutObject' |  |  |  |
| parseLayouts | qsa:'Metadata ScriptTrigger' |  |  |  |
| parseLayouts | qsa:'Step' |  |  |  |
| parseScripts | attr:'enable' |  |  |  |
| parseScripts | attr:'hidden' |  |  |  |
| parseScripts | attr:'id' |  |  |  |
| parseScripts | attr:'isFolder' |  |  |  |
| parseScripts | attr:'name' |  |  |  |
| parseScripts | attr:'runwithfullaccess' |  |  |  |
| parseScripts | qs:':scope > Calculation' |  |  |  |
| parseScripts | qs:':scope > FileReference' |  |  |  |
| parseScripts | qs:':scope > Options' |  |  |  |
| parseScripts | qs:':scope > ScriptReference' |  |  |  |
| parseScripts | qs:'ObjectList' |  |  |  |
| parseScripts | qs:'ScriptCatalog' |  |  |  |
| parseScripts | qs:'ScriptReference' |  |  |  |
| parseScripts | qs:'StepsForScripts' |  |  |  |
| parseScripts | qsa:':scope > Script' |  |  |  |
| parseScripts | qsa:':scope > Step' |  |  |  |
| parseScripts | qsa:'Calculation' |  |  |  |
| parseValueLists | attr:'UUID' |  |  |  |
| parseValueLists | attr:'id' |  |  |  |
| parseValueLists | attr:'name' |  |  |  |
| parseValueLists | attr:'type' |  |  |  |
| parseValueLists | attr:'value' |  |  |  |
| parseValueLists | qs:':scope > Field' |  |  |  |
| parseValueLists | qs:':scope > PrimaryField > FieldReference' |  |  |  |
| parseValueLists | qs:':scope > Source' |  |  |  |
| parseValueLists | qs:':scope > UUID' |  |  |  |
| parseValueLists | qs:'OptionsForValueLists' |  |  |  |
| parseValueLists | qs:'PrimaryField' |  |  |  |
| parseValueLists | qs:'ShowRelated' |  |  |  |
| parseValueLists | qs:'Source' |  |  |  |
| parseValueLists | qs:'TableOccurrenceReference' |  |  |  |
| parseValueLists | qs:'ValueListCatalog' |  |  |  |
| parseValueLists | qsa:':scope > ValueList' |  |  |  |
| parseValueLists | qsa:'Value' |  |  |  |
| parseValueLists | qsa:'ValueList' |  |  |  |
| parseValueLists | qsa:'ValueListReference[UUID]' |  |  |  |
| parseAccounts | attr:'Export' |  |  |  |
| parseAccounts | attr:'Print' |  |  |  |
| parseAccounts | attr:'allowOverride' |  |  |  |
| parseAccounts | attr:'commands' |  |  |  |
| parseAccounts | attr:'disconnectIdle' |  |  |  |
| parseAccounts | attr:'enable' |  |  |  |
| parseAccounts | attr:'id' |  |  |  |
| parseAccounts | attr:'manageDatabase' |  |  |  |
| parseAccounts | attr:'membercount' |  |  |  |
| parseAccounts | attr:'name' |  |  |  |
| parseAccounts | attr:'type' |  |  |  |
| parseAccounts | qs:':scope > ObjectList' |  |  |  |
| parseAccounts | qs:'AccountsCatalog' |  |  |  |
| parseAccounts | qs:'Authentication' |  |  |  |
| parseAccounts | qs:'ExtendedPrivilegesCatalog' |  |  |  |
| parseAccounts | qs:'Other' |  |  |  |
| parseAccounts | qs:'PasswordEncrypted' |  |  |  |
| parseAccounts | qs:'PrivilegeSetReference' |  |  |  |
| parseAccounts | qs:'PrivilegeSetsCatalog' |  |  |  |
| parseAccounts | qsa:':scope > Account' |  |  |  |
| parseAccounts | qsa:':scope > ExtendedPrivilege' |  |  |  |
| parseAccounts | qsa:':scope > PrivilegeSet' |  |  |  |
| parseAccounts | qsa:'PrivilegeSetReference' |  |  |  |
| parseCustomFunctions | attr:'id' |  |  |  |
| parseCustomFunctions | attr:'name' |  |  |  |
| parseCustomFunctions | qs:'CustomFunctionsCatalog' |  |  |  |
| parseCustomFunctions | qs:'Display' |  |  |  |
| parseCustomFunctions | qs:'ObjectList' |  |  |  |
| parseCustomFunctions | qsa:':scope > CustomFunction' |  |  |  |
| parseCustomFunctions | qsa:'CalcsForCustomFunctions CustomFunction' |  |  |  |
| parseCustomFunctions | qsa:'Chunk[type="CustomFunctionRef"]' |  |  |  |
| parsePersistentStores | attr:'accountName' |  |  |  |
| parsePersistentStores | attr:'id' |  |  |  |
| parsePersistentStores | attr:'instanceID' |  |  |  |
| parsePersistentStores | attr:'modifications' |  |  |  |
| parsePersistentStores | attr:'name' |  |  |  |
| parsePersistentStores | attr:'timestamp' |  |  |  |
| parsePersistentStores | attr:'type' |  |  |  |
| parsePersistentStores | attr:'userName' |  |  |  |
| parsePersistentStores | qs:':scope > UUID' |  |  |  |
| parsePersistentStores | qs:':scope > Value' |  |  |  |
| parsePersistentStores | qs:'Data' |  |  |  |
| parsePersistentStores | qs:'PersistentStoreCatalog' |  |  |  |
| parsePersistentStores | qsa:':scope > PersistentStore' |  |  |  |
| parseBrokenReferences | attr:'fieldtype' |  |  |  |
| parseBrokenReferences | attr:'id' |  |  |  |
| parseBrokenReferences | attr:'name' |  |  |  |
| parseBrokenReferences | attr:'type' |  |  |  |
| parseBrokenReferences | attr:'value' |  |  |  |
| parseBrokenReferences | qs:':scope > AutoEnter' |  |  |  |
| parseBrokenReferences | qs:':scope > BaseTableReference' |  |  |  |
| parseBrokenReferences | qs:':scope > Field > ' |  |  |  |
| parseBrokenReferences | qs:':scope > LeftTable' |  |  |  |
| parseBrokenReferences | qs:':scope > Name' |  |  |  |
| parseBrokenReferences | qs:':scope > ObjectList' |  |  |  |
| parseBrokenReferences | qs:':scope > RightTable' |  |  |  |
| parseBrokenReferences | qs:':scope > ScriptReference' |  |  |  |
| parseBrokenReferences | qs:':scope > Source' |  |  |  |
| parseBrokenReferences | qs:':scope > Validation' |  |  |  |
| parseBrokenReferences | qs:'FieldReference' |  |  |  |
| parseBrokenReferences | qs:'LayoutCatalog' |  |  |  |
| parseBrokenReferences | qs:'Looked_up' |  |  |  |
| parseBrokenReferences | qs:'RelationshipCatalog' |  |  |  |
| parseBrokenReferences | qs:'ScriptCatalog' |  |  |  |
| parseBrokenReferences | qs:'StepsForScripts' |  |  |  |
| parseBrokenReferences | qs:'TableOccurrenceReference' |  |  |  |
| parseBrokenReferences | qs:'ValueListCatalog' |  |  |  |
| parseBrokenReferences | qsa:':scope > Calculation' |  |  |  |
| parseBrokenReferences | qsa:':scope > Condition' |  |  |  |
| parseBrokenReferences | qsa:':scope > Field' |  |  |  |
| parseBrokenReferences | qsa:':scope > Relationship' |  |  |  |
| parseBrokenReferences | qsa:':scope > Script' |  |  |  |
| parseBrokenReferences | qsa:':scope > Step' |  |  |  |
| parseBrokenReferences | qsa:':scope > ValueList' |  |  |  |
| parseBrokenReferences | qsa:'CalcsForCustomFunctions CustomFunction' |  |  |  |
| parseBrokenReferences | qsa:'Calculation' |  |  |  |
| parseBrokenReferences | qsa:'Conditions > Formatting' |  |  |  |
| parseBrokenReferences | qsa:'Conditions > Hide' |  |  |  |
| parseBrokenReferences | qsa:'FieldCatalog' |  |  |  |
| parseBrokenReferences | qsa:'Layout' |  |  |  |
| parseBrokenReferences | qsa:'Portal' |  |  |  |
| parseBrokenReferences | qsa:'Script' |  |  |  |
| parseBrokenReferences | qsa:'Tooltip' |  |  |  |
| parseGlobalVars | attr:'value' |  |  |  |
| parseGlobalVars | qsa:'Chunk[type="VariableReference"]' |  |  |  |
| parseGlobalVars | qsa:'StepsForScripts Parameter[type="Variable"] > Name[value]' |  |  |  |
| parseCustomMenus | attr:':scope > Base' |  |  |  |
| parseCustomMenus | attr:'membercount' |  |  |  |
| parseCustomMenus | attr:'name' |  |  |  |
| parseCustomMenus | qs:':scope > Base' |  |  |  |
| parseCustomMenus | qs:':scope > ObjectList' |  |  |  |
| parseCustomMenus | qs:'CustomMenuCatalog' |  |  |  |
| parseCustomMenus | qs:'CustomMenuSetCatalog' |  |  |  |
| parseCustomMenus | qs:'MenuItemList' |  |  |  |
| parseCustomMenus | qsa:':scope > CustomMenu' |  |  |  |
| parseCustomMenus | qsa:':scope > CustomMenuSet' |  |  |  |
| parseThemeStyleCss | qsa:'CSS' |  |  |  |
| parseThemes | attr:'custom' |  |  |  |
| parseThemes | attr:'isCustom' |  |  |  |
| parseThemes | attr:'name' |  |  |  |
| parseThemes | qs:':scope > Display' |  |  |  |
| parseThemes | qs:'Display' |  |  |  |
| parseThemes | qs:'Metadata' |  |  |  |
| parseThemes | qs:'ThemeCatalog' |  |  |  |
| parseThemes | qs:'namedstyles' |  |  |  |
| parseThemes | qsa:':scope > Theme' |  |  |  |
| parseThemes | qsa:'color,Color' |  |  |  |
| parseExternalSources | attr:'direction' |  |  |  |
| parseExternalSources | attr:'driver' |  |  |  |
| parseExternalSources | attr:'file' |  |  |  |
| parseExternalSources | attr:'name' |  |  |  |
| parseExternalSources | attr:'source' |  |  |  |
| parseExternalSources | attr:'type' |  |  |  |
| parseExternalSources | qs:'ExternalDataSourcesCatalog' |  |  |  |
| parseExternalSources | qs:'FileAccessCatalog' |  |  |  |
| parseExternalSources | qs:'ODBCDataSourceCatalog' |  |  |  |
| parseExternalSources | qsa:':scope > DataSource, :scope > ODBCDataSource' |  |  |  |
| parseExternalSources | qsa:':scope > ExternalDataSource' |  |  |  |
| parseExternalSources | qsa:':scope > FileAccess, :scope > ObjectList > Authorization' |  |  |  |
| parseExternalSources | qsa:'FilePathList > FilePath' |  |  |  |
| parseBaseDirectories | attr:'name' |  |  |  |
| parseBaseDirectories | attr:'relativeTo' |  |  |  |
| parseBaseDirectories | qs:'BaseDirectoryCatalog' |  |  |  |
| parseBaseDirectories | qsa:':scope > BaseDirectory' |  |  |  |
| parsePlugins | attr:'type' |  |  |  |
| parsePlugins | qsa:'Chunk' |  |  |  |
| parseTags | attr:'isFolder' |  |  |  |
| parseTags | qs:':scope > ObjectList' |  |  |  |
| parseTags | qs:':scope > TagList' |  |  |  |
| parseTags | qs:'LayoutCatalog' |  |  |  |
| parseTags | qs:'ScriptCatalog' |  |  |  |
| parseTags | qs:'TableOccurrenceCatalog' |  |  |  |
| parseTags | qsa:':scope > Field[fieldtype]' |  |  |  |
| parseTags | qsa:':scope > TableOccurrence' |  |  |  |
| parseTags | qsa:'FieldCatalog' |  |  |  |
| parseTags | qsa:'Layout' |  |  |  |
| parseTags | qsa:'Script' |  |  |  |
| parseModifications | attr:'Display' |  |  |  |
| parseModifications | attr:'modifications' |  |  |  |
| parseModifications | attr:'name' |  |  |  |
| parseModifications | attr:'timestamp' |  |  |  |
| parseModifications | attr:'userName' |  |  |  |
| parseModifications | qsa:'UUID[modifications]' |  |  |  |
| parseBitFlags | attr:'Options' |  |  |  |
| parseBitFlags | attr:'inputMode' |  |  |  |
| parseBitFlags | attr:'name' |  |  |  |
| parseBitFlags | attr:'show' |  |  |  |
| parseBitFlags | attr:'type' |  |  |  |
| parseBitFlags | qs:':scope > Field' |  |  |  |
| parseBitFlags | qs:':scope > Options' |  |  |  |
| parseBitFlags | qs:':scope > Portal' |  |  |  |
| parseBitFlags | qs:':scope > Usage' |  |  |  |
| parseBitFlags | qs:'AccountsCatalog' |  |  |  |
| parseBitFlags | qs:'Definition' |  |  |  |
| parseBitFlags | qs:'LayoutCatalog' |  |  |  |
| parseBitFlags | qsa:'Layout' |  |  |  |
| parseBitFlags | qsa:'LayoutObject' |  |  |  |
| parseBitFlags | qsa:'Part' |  |  |  |
| parseDeepAnalysis | attr:'enable' |  |  |  |
| parseDeepAnalysis | attr:'fieldtype' |  |  |  |
| parseDeepAnalysis | attr:'global' |  |  |  |
| parseDeepAnalysis | attr:'id' |  |  |  |
| parseDeepAnalysis | attr:'index' |  |  |  |
| parseDeepAnalysis | attr:'name' |  |  |  |
| parseDeepAnalysis | attr:'state' |  |  |  |
| parseDeepAnalysis | attr:'storeCalculationResults' |  |  |  |
| parseDeepAnalysis | attr:'type' |  |  |  |
| parseDeepAnalysis | attr:'value' |  |  |  |
| parseDeepAnalysis | qs:':scope > BaseTableReference' |  |  |  |
| parseDeepAnalysis | qs:':scope > ObjectList' |  |  |  |
| parseDeepAnalysis | qs:':scope > ScriptReference' |  |  |  |
| parseDeepAnalysis | qs:':scope > Storage' |  |  |  |
| parseDeepAnalysis | qs:'BaseTableCatalog' |  |  |  |
| parseDeepAnalysis | qs:'Calculation' |  |  |  |
| parseDeepAnalysis | qs:'CustomMenuCatalog' |  |  |  |
| parseDeepAnalysis | qs:'DialogOptions > Storage' |  |  |  |
| parseDeepAnalysis | qs:'LayoutCatalog' |  |  |  |
| parseDeepAnalysis | qs:'LayoutReference' |  |  |  |
| parseDeepAnalysis | qs:'Name' |  |  |  |
| parseDeepAnalysis | qs:'NoInteract' |  |  |  |
| parseDeepAnalysis | qs:'ObjectList' |  |  |  |
| parseDeepAnalysis | qs:'Parameter[type="Variable"]' |  |  |  |
| parseDeepAnalysis | qs:'Set' |  |  |  |
| parseDeepAnalysis | qs:'StepsForScripts' |  |  |  |
| parseDeepAnalysis | qs:'Value > Calculation' |  |  |  |
| parseDeepAnalysis | qsa:':scope > Field[fieldtype]' |  |  |  |
| parseDeepAnalysis | qsa:':scope > Script' |  |  |  |
| parseDeepAnalysis | qsa:':scope > Step' |  |  |  |
| parseDeepAnalysis | qsa:'BaseTable' |  |  |  |
| parseDeepAnalysis | qsa:'Calculation' |  |  |  |
| parseDeepAnalysis | qsa:'FieldCatalog' |  |  |  |
| parseDeepAnalysis | qsa:'LayoutObject' |  |  |  |
| parseDeepAnalysis | qsa:'Part' |  |  |  |
| parseDeepAnalysis | qsa:'StepsForScripts Calculation' |  |  |  |
| parseUnreferenced | attr:'UUID' |  |  |  |
| parseUnreferenced | attr:'datatype' |  |  |  |
| parseUnreferenced | attr:'displayName' |  |  |  |
| parseUnreferenced | attr:'enable' |  |  |  |
| parseUnreferenced | attr:'fieldtype' |  |  |  |
| parseUnreferenced | attr:'global' |  |  |  |
| parseUnreferenced | attr:'id' |  |  |  |
| parseUnreferenced | attr:'index' |  |  |  |
| parseUnreferenced | attr:'isFolder' |  |  |  |
| parseUnreferenced | attr:'name' |  |  |  |
| parseUnreferenced | attr:'type' |  |  |  |
| parseUnreferenced | qs:':scope > AutoEnter' |  |  |  |
| parseUnreferenced | qs:':scope > BaseTableReference' |  |  |  |
| parseUnreferenced | qs:':scope > Calculation' |  |  |  |
| parseUnreferenced | qs:':scope > Comment' |  |  |  |
| parseUnreferenced | qs:':scope > Display' |  |  |  |
| parseUnreferenced | qs:':scope > LeftTable TableOccurrenceReference' |  |  |  |
| parseUnreferenced | qs:':scope > LeftTable' |  |  |  |
| parseUnreferenced | qs:':scope > ObjectList' |  |  |  |
| parseUnreferenced | qs:':scope > RightTable TableOccurrenceReference' |  |  |  |
| parseUnreferenced | qs:':scope > RightTable' |  |  |  |
| parseUnreferenced | qs:':scope > ScriptReference' |  |  |  |
| parseUnreferenced | qs:':scope > Storage' |  |  |  |
| parseUnreferenced | qs:':scope > TableOccurrenceReference' |  |  |  |
| parseUnreferenced | qs:':scope > UUID' |  |  |  |
| parseUnreferenced | qs:':scope > UUID, :scope > ObjectList, :scope > Bounds' |  |  |  |
| parseUnreferenced | qs:':scope > Validation' |  |  |  |
| parseUnreferenced | qs:'BaseTableCatalog' |  |  |  |
| parseUnreferenced | qs:'BaseTableSourceReference > BaseTableReference' |  |  |  |
| parseUnreferenced | qs:'Display' |  |  |  |
| parseUnreferenced | qs:'LayoutCatalog' |  |  |  |
| parseUnreferenced | qs:'LayoutReference' |  |  |  |
| parseUnreferenced | qs:'LayoutReference[id="0"]' |  |  |  |
| parseUnreferenced | qs:'LeftField > FieldReference' |  |  |  |
| parseUnreferenced | qs:'Metadata > namedstyles' |  |  |  |
| parseUnreferenced | qs:'RelationshipCatalog' |  |  |  |
| parseUnreferenced | qs:'RightField > FieldReference' |  |  |  |
| parseUnreferenced | qs:'ScriptCatalog' |  |  |  |
| parseUnreferenced | qs:'ScriptReference' |  |  |  |
| parseUnreferenced | qs:'StepsForScripts' |  |  |  |
| parseUnreferenced | qs:'TableOccurrenceCatalog' |  |  |  |
| parseUnreferenced | qs:'TableOccurrenceReference' |  |  |  |
| parseUnreferenced | qs:'Text' |  |  |  |
| parseUnreferenced | qs:'ThemeCatalog' |  |  |  |
| parseUnreferenced | qs:'ValueListCatalog' |  |  |  |
| parseUnreferenced | qsa:':scope > Calculation' |  |  |  |
| parseUnreferenced | qsa:':scope > Field[fieldtype]' |  |  |  |
| parseUnreferenced | qsa:':scope > ObjectList > Field, :scope > Field' |  |  |  |
| parseUnreferenced | qsa:':scope > TableOccurrence' |  |  |  |
| parseUnreferenced | qsa:':scope > Theme' |  |  |  |
| parseUnreferenced | qsa:':scope > ValueList' |  |  |  |
| parseUnreferenced | qsa:'BaseTable' |  |  |  |
| parseUnreferenced | qsa:'BaseTableReference' |  |  |  |
| parseUnreferenced | qsa:'CalcsForCustomFunctions CustomFunction' |  |  |  |
| parseUnreferenced | qsa:'Calculation' |  |  |  |
| parseUnreferenced | qsa:'Conditions > Formatting > Condition > Calculation' |  |  |  |
| parseUnreferenced | qsa:'Conditions > Hide > Calculation' |  |  |  |
| parseUnreferenced | qsa:'FieldCatalog' |  |  |  |
| parseUnreferenced | qsa:'FieldReference' |  |  |  |
| parseUnreferenced | qsa:'JoinPredicate' |  |  |  |
| parseUnreferenced | qsa:'Layout' |  |  |  |
| parseUnreferenced | qsa:'LayoutObject LocalCSS' |  |  |  |
| parseUnreferenced | qsa:'Part LocalCSS' |  |  |  |
| parseUnreferenced | qsa:'Portal > Calculation' |  |  |  |
| parseUnreferenced | qsa:'Relationship Calculation' |  |  |  |
| parseUnreferenced | qsa:'Relationship' |  |  |  |
| parseUnreferenced | qsa:'Script' |  |  |  |
| parseUnreferenced | qsa:'ScriptReference' |  |  |  |
| parseUnreferenced | qsa:'Step Calculation' |  |  |  |
| parseUnreferenced | qsa:'Step LayoutReference' |  |  |  |
| parseUnreferenced | qsa:'Step' |  |  |  |
| parseUnreferenced | qsa:'StepsForScripts > Script' |  |  |  |
| parseUnreferenced | qsa:'StyledText > Data' |  |  |  |
| parseUnreferenced | qsa:'TableOccurrenceReference' |  |  |  |
| parseUnreferenced | qsa:'Tooltip > Calculation' |  |  |  |
| parseUnreferenced | qsa:'ValueListReference' |  |  |  |
| render | s.accounts.acc.account_count |  |  |  |
| render | s.accounts.acc.blank_password |  |  |  |
| render | s.accounts.acc.detail |  |  |  |
| render | s.accounts.acc.names_hidden |  |  |  |
| render | s.accounts.ep.detail |  |  |  |
| render | s.accounts.ep.extended_privilege_count |  |  |  |
| render | s.accounts.priv.detail |  |  |  |
| render | s.accounts.priv.privilege_set_count |  |  |  |
| render | s.baseDirs |  |  |  |
| render | s.bitflags |  |  |  |
| render | s.customs.custom_function_count |  |  |  |
| render | s.customs.custom_function_references |  |  |  |
| render | s.customs.detail |  |  |  |
| render | s.deep.script_issues |  |  |  |
| render | s.deep.scripts_dead_setvar |  |  |  |
| render | s.deep.scripts_embedded_credentials |  |  |  |
| render | s.deep.scripts_hardcoded_account |  |  |  |
| render | s.deep.scripts_pSoS_client_steps |  |  |  |
| render | s.deep.scripts_swallowed_errors |  |  |  |
| render | s.deep.scripts_with_unguarded_abort_off |  |  |  |
| render | s.ext.detail |  |  |  |
| render | s.fileMeta.encryption |  |  |  |
| render | s.fileMeta.file_trigger_actions |  |  |  |
| render | s.fileMeta.hide_toolbars |  |  |  |
| render | s.fileMeta.hide_web_direct |  |  |  |
| render | s.fileMeta.login_type |  |  |  |
| render | s.fileMeta.min_fm_version |  |  |  |
| render | s.fileMeta.save_password |  |  |  |
| render | s.fileMeta.startup_layout |  |  |  |
| render | s.globals.detail |  |  |  |
| render | s.globals.global_variable_count |  |  |  |
| render | s.globals.max_global_contacts |  |  |  |
| render | s.graph.cascade_delete |  |  |  |
| render | s.graph.detail.relationships_all |  |  |  |
| render | s.graph.detail.tos_all |  |  |  |
| render | s.graph.relationship_count |  |  |  |
| render | s.graph.table_occurrence_count |  |  |  |
| render | s.graph.to_zero_relationships |  |  |  |
| render | s.layouts.button_bars |  |  |  |
| render | s.layouts.detail |  |  |  |
| render | s.layouts.info |  |  |  |
| render | s.layouts.layout_count |  |  |  |
| render | s.layouts.local_css_objects |  |  |  |
| render | s.layouts.objects_total |  |  |  |
| render | s.layouts.popovers |  |  |  |
| render | s.layouts.portals_total |  |  |  |
| render | s.layouts.slide_controls |  |  |  |
| render | s.layouts.tab_controls |  |  |  |
| render | s.layouts.web_viewers |  |  |  |
| render | s.library.binary_data_count |  |  |  |
| render | s.menus.custom_menu_count |  |  |  |
| render | s.menus.custom_menu_set_count |  |  |  |
| render | s.menus.detail |  |  |  |
| render | s.mods.by_user |  |  |  |
| render | s.mods.most_recent |  |  |  |
| render | s.mods.top_modified |  |  |  |
| render | s.mods.total_modifications |  |  |  |
| render | s.name |  |  |  |
| render | s.persistent.count |  |  |  |
| render | s.persistent.detail.all |  |  |  |
| render | s.plugins.detail |  |  |  |
| render | s.plugins.plugin_function_count |  |  |  |
| render | s.plugins.plugin_function_references |  |  |  |
| render | s.scripts.detail |  |  |  |
| render | s.scripts.info |  |  |  |
| render | s.scripts.max_length |  |  |  |
| render | s.scripts.orphaned_enabled_steps |  |  |  |
| render | s.scripts.script_count |  |  |  |
| render | s.scripts.step_count |  |  |  |
| render | s.scripts.unbalanced_if_scripts |  |  |  |
| render | s.scripts.unbalanced_loop_scripts |  |  |  |
| render | s.scripts.unknown_step_id_count |  |  |  |
| render | s.tables.calc_fields |  |  |  |
| render | s.tables.detail.fields_auto_entry |  |  |  |
| render | s.tables.detail.fields_calc |  |  |  |
| render | s.tables.detail.fields_container |  |  |  |
| render | s.tables.detail.fields_global |  |  |  |
| render | s.tables.detail.fields_summary |  |  |  |
| render | s.tables.field_count |  |  |  |
| render | s.tables.field_info |  |  |  |
| render | s.tables.fields_per_table |  |  |  |
| render | s.tables.stored_calc_fields |  |  |  |
| render | s.tables.table_count |  |  |  |
| render | s.tables.table_info |  |  |  |
| render | s.tables.tables |  |  |  |
| render | s.tables.unstored_calc_fields |  |  |  |
| render | s.tables.unstored_per_table |  |  |  |
| render | s.tags.custom_count |  |  |  |
| render | s.tags.custom_tags |  |  |  |
| render | s.tags.internal_tags |  |  |  |
| render | s.tags.tagged_fields |  |  |  |
| render | s.tags.tagged_layouts |  |  |  |
| render | s.tags.tagged_scripts |  |  |  |
| render | s.tags.tagged_tos |  |  |  |
| render | s.tags.total_assignments |  |  |  |
| render | s.tags.unique_count |  |  |  |
| render | s.theme |  |  |  |
| render | s.themes.detail |  |  |  |
| render | s.themes.theme_count |  |  |  |
| render | s.themes.themes_detail |  |  |  |
| render | s.unrefs.all_styles_detail |  |  |  |
| render | s.unrefs.broken |  |  |  |
| render | s.unrefs.calc_deps |  |  |  |
| render | s.unrefs.confidence.reasons |  |  |  |
| render | s.unrefs.confidence.tier |  |  |  |
| render | s.unrefs.fields |  |  |  |
| render | s.unrefs.fields_tiered |  |  |  |
| render | s.unrefs.layouts |  |  |  |
| render | s.unrefs.layouts_dynamic_warning |  |  |  |
| render | s.unrefs.scripts |  |  |  |
| render | s.unrefs.table_occurrences |  |  |  |
| render | s.unrefs.tables |  |  |  |
| render | s.unrefs.to_removability.completely_unused |  |  |  |
| render | s.unrefs.to_removability.relationship_only |  |  |  |
| render | s.unrefs.unused_styles |  |  |  |
| render | s.unrefs.unused_styles_detail |  |  |  |
| render | s.unrefs.value_lists |  |  |  |
| render | s.used |  |  |  |
| render | s.valueLists.detail.all |  |  |  |
| render | s.valueLists.detail.dynamic_list |  |  |  |
| render | s.valueLists.detail.dynamic_related_only_list |  |  |  |
| render | s.valueLists.detail.static_list |  |  |  |
| render | s.valueLists.value_list_count |  |  |  |
