# SaXML inventory

One row per datum the legacy inspector reads from Save as XML (parser rows) or renders from the stats object (render rows).
Classification is one of `covered`, `derived`, `gap`, `dropped`. `dropped` marks a datum the new inspector does not need, by owner decision; it is not a gap and is not reported to Claris. `fm` names the catalog and key that supplies it, or the register id for a gap.

| Source | Datum | Classification | fm | Notes |
|---|---|---|---|---|
| parseXMLToStats | qs:'parsererror' | covered | runner: parse pipeline replaced by fm NDJSON, no datum | DOMParser error probe. fm returns parsed JSON per op with its own status/error line; there is no XML text to fail on. |
| buildDDRTextIndex | attr:'datatype' | dropped | owner ruling 2026-09-14 | The DDR_INFO display-text index existed to show FileMaker's own pre-rendered text in the Reference Explorer. Not needed in the new inspector, which renders from fm's JSON. (The tokenised references inside DDR_INFO are a separate matter: see catalog-calculation-tokens.) |
| buildDDRTextIndex | qsa:':scope > DDR_INFO' | dropped | owner ruling 2026-09-14 | The DDR_INFO sidecar under every Calculation, used only for the display-text index. Not needed. |
| buildDDRTextIndex | tag:'*' | dropped | owner ruling 2026-09-14 | Walked every element of the DDR_INFO subtree to build the display-text index. Not needed. |
| parseFileMetadata | attr:'action' | gap | catalog-file-metadata | ScriptTrigger action on the file (OnFirstWindowOpen etc.). fm reports layout triggers only. |
| parseFileMetadata | attr:'enable' | gap | catalog-file-metadata | enable on HideToolbars / HideWebDirectSharing / HideClientSharing. No fm catalog for File Options. |
| parseFileMetadata | attr:'keychain' | gap | catalog-file-metadata | SavePassword keychain flag (File Options > log in using). |
| parseFileMetadata | attr:'name' | gap | catalog-file-metadata | Names the startup LayoutReference and each file-trigger ScriptReference. The layout and script exist in read:layout / read:script, but the file-level binding does not. |
| parseFileMetadata | attr:'type' | gap | catalog-file-metadata | Encryption type (0/1) and Login type (-1/0/1). The encryption half is covered by evaluate:calculation `Get ( EncryptionState )`; the login type (File Options) is the gap. |
| parseFileMetadata | attr:'version' | gap | catalog-file-metadata | Minimum version the file requires. |
| parseFileMetadata | qs:'Encryption' | covered | evaluate:calculation `Get ( EncryptionState )` (value "0"/"1") | Encryption-at-rest state. No file catalog, but the Get() function evaluates against the file (verified on ooe 2026-09-14: "0"). The encryption hint and shared-ID details are not exposed. |
| parseFileMetadata | qs:'HideClientSharing' | gap | catalog-file-metadata | File Options checkbox. |
| parseFileMetadata | qs:'HideToolbars' | gap | catalog-file-metadata | File Options checkbox. |
| parseFileMetadata | qs:'HideWebDirectSharing' | gap | catalog-file-metadata | File Options checkbox. |
| parseFileMetadata | qs:'LayoutReference' | gap | catalog-file-metadata | The startup layout binding under Metadata. |
| parseFileMetadata | qs:'Login' | gap | catalog-file-metadata | File Options login mode. |
| parseFileMetadata | qs:'Metadata' | gap | catalog-file-metadata | Root of the whole File Options block. |
| parseFileMetadata | qs:'Minimum' | gap | catalog-file-metadata | Minimum FileMaker version element. |
| parseFileMetadata | qs:'SavePassword' | gap | catalog-file-metadata | File Options save-password element. |
| parseFileMetadata | qs:'ScriptReference' | gap | catalog-file-metadata | Script bound to a file-level trigger. |
| parseFileMetadata | qsa:'ScriptTrigger' | gap | catalog-file-metadata | The list of file-level script triggers; drives s.fileMeta.file_triggers. |
| parseLibrary | qs:'LibraryCatalog' | dropped | owner ruling 2026-09-14 | The image/binary library (button icons, pictures). Not relevant to the analysis; layout objects still name their icon or picture by id. |
| parseLibrary | qsa:'BinaryData' | dropped | owner ruling 2026-09-14 | Binary payload count for the old file-weight stat. Not relevant. |
| parseTablesAndFields | attr:'absolute' | covered | baseDirectory.relative | BaseDirectoryReference absolute on a container's external-storage path; fm reports the inverse boolean on read:baseDirectory, with field.options.container.baseDirectory naming which one. |
| parseTablesAndFields | attr:'comment' | covered | table.description + field.options.comment | Table comment needs a read:table describe (by name); the listing carries only name/id. |
| parseTablesAndFields | attr:'datatype' | covered | field.type | Text/Number/Date/Time/Timestamp/Container; fm uses lowercase words for the same set. |
| parseTablesAndFields | attr:'existing' | covered | field.options.validation.existingValue |  |
| parseTablesAndFields | attr:'fieldtype' | covered | field.options.fieldType | Normal/Calculated/Summary. Needs detail:true on the read:field listing. |
| parseTablesAndFields | attr:'global' | covered | field.options.global |  |
| parseTablesAndFields | attr:'id' | covered | table.id + field.id |  |
| parseTablesAndFields | attr:'index' | covered | field.options.indexing | Plus field.options.autoIndex and field.options.indexLanguage. |
| parseTablesAndFields | attr:'maxRepetitions' | covered | field.options.repetitions |  |
| parseTablesAndFields | attr:'name' | covered | table.name + field.name + baseDirectory.path |  |
| parseTablesAndFields | attr:'notEmpty' | covered | field.options.validation.notEmpty |  |
| parseTablesAndFields | attr:'prohibitModification' | covered | field.options.autoEnter.prohibitModification |  |
| parseTablesAndFields | attr:'storeCalculationResults' | covered | field.options.stored | Stored vs unstored calc; combine with field.options.global the same way the legacy does. |
| parseTablesAndFields | attr:'type' | covered | field.options.autoEnter.type + field.options.container.encrypted | AutoEnter type maps 1:1 (serial/calculated/lookup/creation*/modification*); Remote type Secure/Open maps to container.encrypted. |
| parseTablesAndFields | attr:'unique' | covered | field.options.validation.unique |  |
| parseTablesAndFields | attr:'withFewerFolders' | covered | field.options.container.fewerFolders | Verified on ooe 2026-09-14 (table containers, field encrypted_with_fewer_folders): field.options.container reports external, encrypted, fewerFolders and baseDirectory. Reported only for a secure-storage container. |
| parseTablesAndFields | qs:':scope > AutoEnter' | covered | field.options.autoEnter |  |
| parseTablesAndFields | qs:':scope > BaseDirectoryReference' | covered | field.options.container.baseDirectory |  |
| parseTablesAndFields | qs:':scope > BaseTableReference' | covered | field.table | read:field items carry table{name,id}. |
| parseTablesAndFields | qs:':scope > Calculation' | covered | field.options.calculation.text | Calc-field body. |
| parseTablesAndFields | qs:':scope > ObjectList' | covered | field.items[] | Structural wrapper; fm returns the field array directly. |
| parseTablesAndFields | qs:':scope > Remote' | covered | field.options.container.external |  |
| parseTablesAndFields | qs:':scope > Storage' | covered | field.options.{global,stored,indexing,repetitions} |  |
| parseTablesAndFields | qs:':scope > Text' | covered | field.options.calculation.text | The CDATA formula inside Calculation; fm returns the same text. |
| parseTablesAndFields | qs:':scope > Validation' | covered | field.options.validation |  |
| parseTablesAndFields | qs:'BaseTableCatalog' | covered | read:table listing |  |
| parseTablesAndFields | qs:'BaseTableReference' | covered | field.table.name |  |
| parseTablesAndFields | qs:'Calculation' | covered | field.options.validation.calculation.text |  |
| parseTablesAndFields | qs:'FieldsForTables' | covered | read:field {table} per table | Structural; the legacy second pass exists only because SaXML splits definitions from per-table field lists. |
| parseTablesAndFields | qs:'InRange' | covered | field.options.validation.range.{min,max} |  |
| parseTablesAndFields | qs:'Looked_up' | covered | field.options.autoEnter.lookup | With source.occurrence, source.field, onNoMatch, copyIfSourceEmpty. |
| parseTablesAndFields | qs:'ObjectList' | covered | field.items[] | Structural. |
| parseTablesAndFields | qs:'TableOccurrenceReference' | covered | field.table.name | Resolves which table a FieldCatalog belongs to; fm addresses read:field by table. |
| parseTablesAndFields | qsa:':scope > BaseTable' | covered | read:table items[] |  |
| parseTablesAndFields | qsa:':scope > FieldCatalog' | covered | read:field {table} per table | Structural. |
| parseTablesAndFields | qsa:':scope > Field[fieldtype]' | covered | read:field items[] |  |
| parseTablesAndFields | qsa:'FieldCatalog' | covered | read:field {table} per table | Structural. |
| parseRelationships | attr:'baseTable' | covered | tableOccurrence.table.name | Legacy fallback attribute for a TO with no relationships. |
| parseRelationships | attr:'blue' | covered | tableOccurrence.graph.color | fm returns one colour string instead of red/green/blue integers; the to_colors tally works the same on it. |
| parseRelationships | attr:'cascadeCreate' | covered | relation.leftToRight.createRelated + relation.rightToLeft.createRelated |  |
| parseRelationships | attr:'cascadeDelete' | covered | relation.leftToRight.cascadeDelete + relation.rightToLeft.cascadeDelete |  |
| parseRelationships | attr:'green' | covered | tableOccurrence.graph.color | See attr:'blue'. |
| parseRelationships | attr:'id' | covered | tableOccurrence.id + relation.id |  |
| parseRelationships | attr:'name' | covered | tableOccurrence.name + relation.left.name + relation.right.name |  |
| parseRelationships | attr:'red' | covered | tableOccurrence.graph.color | See attr:'blue'. |
| parseRelationships | attr:'table' | covered | tableOccurrence.table.name |  |
| parseRelationships | attr:'type' | covered | relation.predicates[].op | Equal/NotEqual/Greater/Less/GreaterOrEqual/LessOrEqual; fm uses its own operator words for the same six. |
| parseRelationships | qs:':scope > LeftTable' | covered | relation.left + relation.leftToRight |  |
| parseRelationships | qs:':scope > RightTable' | covered | relation.right + relation.rightToLeft |  |
| parseRelationships | qs:'BaseTableReference' | covered | tableOccurrence.table |  |
| parseRelationships | qs:'Color' | covered | tableOccurrence.graph.color | Needs a read:tableOccurrence describe; the listing has no graph block. |
| parseRelationships | qs:'LeftField > FieldReference' | covered | relation.predicates[].leftField |  |
| parseRelationships | qs:'RelationshipCatalog' | covered | read:relation listing |  |
| parseRelationships | qs:'RightField > FieldReference' | covered | relation.predicates[].rightField |  |
| parseRelationships | qs:'SortSpecification' | covered | relation.rightToLeft.sortSpec.fields[]{field,order} | The relationship's stored sort order. fm 0.7.0 reports the sort on whichever side sorts: `leftToRight.sortSpec` / `rightToLeft.sortSpec` appear when that side's `sortRelated` is true, with `fields[].field` naming each sort field, `fields[].order` its direction, and the length of `fields[]` giving the number of sort fields. "Put blanks last" and "keep records sorted" (`maintain`) are still unreported; they stay on the register's `relation` entry. |
| parseRelationships | qs:'TableOccurrenceCatalog' | covered | read:tableOccurrence listing |  |
| parseRelationships | qs:'TableOccurrenceReference' | covered | relation.left.name + relation.right.name |  |
| parseRelationships | qsa:':scope > Relationship' | covered | read:relation items[] |  |
| parseRelationships | qsa:':scope > TableOccurrence' | covered | read:tableOccurrence items[] |  |
| parseRelationships | qsa:'JoinPredicate' | covered | relation.predicates[] |  |
| parseLayouts | attr:'Display' | covered | layout.theme.displayName | LayoutThemeReference Display, the human-readable theme name; drives s.layouts.theme_layout_map. |
| parseLayouts | attr:'Style' | covered | layout.contents.objects[].control | Field Display Style 0-5 maps to fm's control word (editBox, dropDownList, popupMenu, radioButtonSet, checkboxSet, dropDownCalendar). |
| parseLayouts | attr:'allowFormView' | covered | layout.viewStyles.enabled.form |  |
| parseLayouts | attr:'allowListView' | covered | layout.viewStyles.enabled.list |  |
| parseLayouts | attr:'allowTableView' | covered | layout.viewStyles.enabled.table |  |
| parseLayouts | attr:'defaultView' | covered | layout.viewStyles.default |  |
| parseLayouts | attr:'displayName' | gap | catalog-object-styles | LocalCSS displayName. layout.contents.objects[].style gives the named style's display name, but an object whose LocalCSS carries CSS text and no style name (the local-override case this parser counts) is invisible to fm. |
| parseLayouts | attr:'enable' | derived | derived from layout.contents.objects[].action | buttons_single_step. fm models a button action as exactly one step object (action.step/stepID) or a script call, so the enabled-step tally collapses to whether action is present. |
| parseLayouts | attr:'hidden' | covered | layout.hidden | Options hidden=True means the layout is hidden from the Layouts menu. |
| parseLayouts | attr:'id' | covered | layout.id + layout.contents.objects[].id |  |
| parseLayouts | attr:'isFolder' | covered | layout.type | fm reports type 'folder' vs 'layout' in both tree and flatten modes. |
| parseLayouts | attr:'left' | covered | layout.contents.objects[].bounds.left |  |
| parseLayouts | attr:'name' | covered | layout.name + layout.contents.objects[].name + layout.tableOccurrence.name |  |
| parseLayouts | attr:'quickFind' | covered | layout.contents.objects[].quickFind | Object-level Quick Find. The layout-level Quick Find option is layout.flags.set "disableQuickFind" (bit 15, 0x8000; set when quick find is off). |
| parseLayouts | attr:'right' | derived | derived from layout.contents.objects[].bounds.left + bounds.width | fm reports width, not a right edge; objects_outside_bounds compares left+width against geometry.baseWidth. |
| parseLayouts | attr:'rowLimit' | covered | layout.contents.objects[].rows | Portal row count. |
| parseLayouts | attr:'rowsperpage' | covered | layout.contents.objects[].rows | Alternate spelling of the same portal row count. |
| parseLayouts | attr:'saveRecord' | covered | layout.flags.set contains "confirmRecordSave" (bit 4, 0x10) | Layout Setup > General > Save record changes automatically. fm's own layout flag table (34 names, register Task 6) names the bit confirmRecordSave: set when the confirmation dialog is asked for, i.e. auto-save off. Not exercised on the reference layouts (bit clear on all), reported when set. |
| parseLayouts | attr:'show' | gap | catalog-portal-setup | Portal Options show bitmask. Bit 2 (allow delete) is covered by layout.contents.objects[].allowDelete; bits 1 (allow create), 8 (sorted) and 16 (filtered) have no fm key - confirmed by the layout describe notes, which say the portal's sort and filter are reported nowhere. |
| parseLayouts | attr:'startrow' | covered | layout.contents.objects[].initialRow |  |
| parseLayouts | attr:'type' | covered | layout.contents.objects[].type | 19 object type words cover every LayoutObject type the legacy counts. The Part type reading of this same attribute is a gap, registered on qs:':scope > PartsList'. |
| parseLayouts | attr:'width' | covered | layout.geometry.baseWidth |  |
| parseLayouts | qs:':scope > Button' | covered | layout.contents.objects[].type = button + .action |  |
| parseLayouts | qs:':scope > Field' | covered | layout.contents.objects[].field |  |
| parseLayouts | qs:':scope > LayoutThemeReference' | covered | layout.theme |  |
| parseLayouts | qs:':scope > LocalCSS' | gap | catalog-object-styles | The per-object local CSS override text and its property count (s.layouts.objects_with_local_css, local_css_node_count, local_css_objects). fm reports only the named style under objects[].style. |
| parseLayouts | qs:':scope > MenuSetReference' | gap | catalog-layout-menuset | Which custom menu set a layout installs. read:customMenuSet lists the sets and read:layout describes the layout, but no key joins them. |
| parseLayouts | qs:':scope > Options' | covered | layout.viewStyles + layout.hidden + layout.flags | saveRecord and the layout-level quickFind inside this element are flags.set names confirmRecordSave and disableQuickFind (fm's 34-name layout flag table). |
| parseLayouts | qs:':scope > PartsList' | covered | layout.parts[]{type,height,offset,name,breakField} | Layout part bands. fm 0.7.0 reports them at the layout's top level rather than inside `contents.objects[]`: one entry per part, `type` one of titleHeader, header, leadingGrandSummary, leadingSubSummary, body, trailingSubSummary, trailingGrandSummary, footer, titleFooter, topNavigation, bottomNavigation, plus `height`, `offset`, `name` and, on a sub-summary, `breakField{name,id,tableOccurrence{id,name}}`. Part presence, count, order and geometry all come from this array; the options word does not (catalog-layout-parts). |
| parseLayouts | qs:':scope > Portal' | covered | layout.contents.objects[].type = portal |  |
| parseLayouts | qs:':scope > ScriptTriggers' | covered | layout.scriptTriggers[] + layout.contents.objects[].scriptTriggers[] | Layout describe also gives scriptTriggerCount directly. The object-level key is present on 206 of 473 objects in the samples — absent on object kinds that cannot hold a trigger, `[]` when a kind can and has none — so consumers must guard for its absence rather than assume it is always there. |
| parseLayouts | qs:':scope > Table' | covered | layout.contents.objects[].tableOccurrence | The portal's table occurrence. |
| parseLayouts | qs:':scope > TableOccurrenceReference' | covered | layout.tableOccurrence | Present on the listing as well as the describe. |
| parseLayouts | qs:':scope > Theme' | covered | layout.theme |  |
| parseLayouts | qs:':scope > Usage' | covered | layout.contents.objects[].quickFind + browseEntry + findEntry |  |
| parseLayouts | qs:':scope > action' | covered | layout.contents.objects[].action |  |
| parseLayouts | qs:'Bounds' | covered | layout.contents.objects[].bounds | left/top/width/height on every object at every nesting depth. |
| parseLayouts | qs:'ButtonBar > ObjectList' | covered | layout.contents.objects[].objects[] on a buttonBar | Segments are nested button objects; button_bar_segments is their length. |
| parseLayouts | qs:'CustomMenuSetReference' | gap | catalog-layout-menuset | Alternate tag for the same layout-to-menu-set binding. |
| parseLayouts | qs:'Display' | covered | layout.contents.objects[].control | See attr:'Style'. |
| parseLayouts | qs:'IconData' | covered | layout.contents.objects[].iconId | Absent on a button with no icon, which is exactly the buttons_with_icon test. The icon image itself is not readable: catalog-library. |
| parseLayouts | qs:'LayoutCatalog' | covered | read:layout {flatten:true} listing |  |
| parseLayouts | qs:'ScriptReference' | covered | layout.contents.objects[].action.script |  |
| parseLayouts | qs:'SlideControl > ObjectList' | covered | layout.contents.objects[].objects[] on a slideControl |  |
| parseLayouts | qs:'Step' | covered | layout.contents.objects[].action.step | Single-step button actions report step, stepID and the step's own option keys. |
| parseLayouts | qs:'TabControl > ObjectList' | covered | layout.contents.objects[].objects[] on a tabControl |  |
| parseLayouts | qs:'ThemeReference' | covered | layout.theme |  |
| parseLayouts | qsa:'LayoutCatalog ScriptReference' | derived | derived from layout.contents.objects[].action.script + layout.scriptTriggers[].script | s.layouts.script_refs_from_layouts is the count of both across every layout. |
| parseLayouts | qsa:'LayoutObject' | covered | layout.contents.objects[] (recursive) | Nested objects appear under objects[] on group, portal, popover, tabControl/tabPanel, slideControl/slidePanel and buttonBar. |
| parseLayouts | qsa:'Metadata ScriptTrigger' | gap | catalog-file-metadata | The FILE's own script triggers (File Options: OnFirstWindowOpen, OnLastWindowClose, OnWindowOpen, OnWindowClose...), which SaXML stores under Metadata, not under any layout. The legacy Layouts tab counted them a second time to show a file-triggers figure beside the layout trigger counts. Layout-level and object-level triggers are fully covered by read:layout; only the file-level bindings have no fm op. |
| parseLayouts | qsa:'Step' | covered | layout.contents.objects[].action |  |
| parseScripts | attr:'enable' | covered | script.body[].disabled | Inverse sense: fm reports disabled true where SaXML says enable=False, and the key is absent on an enabled step. |
| parseScripts | attr:'hidden' | covered | script.hidden | hidden=False in SaXML means 'include in menu'; fm reports the boolean directly on both listing and describe. |
| parseScripts | attr:'id' | covered | script.id + script.body[].stepID |  |
| parseScripts | attr:'isFolder' | covered | script.type | folder / script / separator. |
| parseScripts | attr:'name' | covered | script.name + script.body[].step |  |
| parseScripts | attr:'runwithfullaccess' | covered | script.runWithFullAccess | Describe only; the listing does not carry it. |
| parseScripts | qs:':scope > Calculation' | covered | script.body[].parameter | Presence of a parameter on Perform Script / PSoS, for perform_script_with_param. |
| parseScripts | qs:':scope > FileReference' | covered | script.body[].file | Distinguishes a genuine cross-file call from a dangling in-file script reference in the call graph. |
| parseScripts | qs:':scope > Options' | covered | script.runWithFullAccess + script.hidden |  |
| parseScripts | qs:':scope > ScriptReference' | covered | script.name + script.body[].script |  |
| parseScripts | qs:'ObjectList' | covered | script.body[] | Structural. |
| parseScripts | qs:'ScriptCatalog' | covered | read:script {flatten:true} listing |  |
| parseScripts | qs:'ScriptReference' | covered | script.body[].script | Callee name for the call graph. |
| parseScripts | qs:'StepsForScripts' | covered | read:script {id} describe | fm needs one describe per script to get body[]; the listing gives only steps as a count. |
| parseScripts | qsa:':scope > Script' | covered | read:script items[] |  |
| parseScripts | qsa:':scope > Step' | covered | script.body[] | Also gives block{role,start,end}, which replaces the legacy's own If/Loop balance counting. |
| parseScripts | qsa:'Calculation' | covered | script.body[] calculation-valued keys | value, condition, parameter, calculation, name and slots.calc.* carry the formula text the $$-scan reads. |
| parseValueLists | attr:'UUID' | derived | derived from layout.contents.objects[].valueList.{id,name} + field.options.validation.valueList | fm gives value lists no UUID; the reference tally joins on id/name instead. |
| parseValueLists | attr:'id' | covered | valueList.id |  |
| parseValueLists | attr:'name' | covered | valueList.name |  |
| parseValueLists | attr:'type' | covered | valueList.type | Source type attribute; fm's type word carries the same custom / fromField / fromFile distinction. |
| parseValueLists | attr:'value' | covered | valueList.type | Source value attribute (Custom / FromField). |
| parseValueLists | qs:':scope > Field' | covered | valueList.field | With field.occurrence and field.field. |
| parseValueLists | qs:':scope > PrimaryField > FieldReference' | covered | valueList.field.{occurrence,field} |  |
| parseValueLists | qs:':scope > Source' | covered | valueList.type |  |
| parseValueLists | qs:':scope > UUID' | derived | derived from valueList.id + valueList.name | The value list's own UUID is only the join key for the reference tally; fm joins by id/name. |
| parseValueLists | qs:'OptionsForValueLists' | covered | valueList.options | showRelatedOnly, showSecondFieldOnly, sortBySecondField. |
| parseValueLists | qs:'PrimaryField' | covered | valueList.field |  |
| parseValueLists | qs:'ShowRelated' | covered | valueList.options.showRelatedOnly | Plus valueList.startTable, which names the relationship start. |
| parseValueLists | qs:'Source' | covered | valueList.type |  |
| parseValueLists | qs:'TableOccurrenceReference' | covered | valueList.field.occurrence |  |
| parseValueLists | qs:'ValueListCatalog' | covered | read:valueList listing |  |
| parseValueLists | qsa:':scope > ValueList' | covered | read:valueList items[] |  |
| parseValueLists | qsa:'Value' | covered | valueList.values[] | Custom-values list; item count is values.length. |
| parseValueLists | qsa:'ValueList' | covered | read:valueList items[] |  |
| parseValueLists | qsa:'ValueListReference[UUID]' | derived | derived from layout.contents.objects[].valueList + field.options.validation.valueList | s.valueLists per-list refs count; fm surfaces every value-list reference on the object or field that makes it. |
| parseAccounts | attr:'Export' | covered | privilegeSet.fileOptions.exportAllowed |  |
| parseAccounts | attr:'Print' | covered | privilegeSet.fileOptions.printAllowed |  |
| parseAccounts | attr:'allowOverride' | covered | privilegeSet.fileOptions.dataEntryOverride |  |
| parseAccounts | attr:'commands' | covered | privilegeSet.fileOptions.menuCommands | commands='Minimal' is one of the words fm reports here. |
| parseAccounts | attr:'disconnectIdle' | covered | privilegeSet.fileOptions.noIdleDisconnect | Inverse sense: disconnectIdle=True corresponds to noIdleDisconnect false. |
| parseAccounts | attr:'enable' | covered | account.enabled | Describe only; the listing carries name/id/builtIn. |
| parseAccounts | attr:'id' | covered | account.id + privilegeSet.id + extendedPrivilege.id |  |
| parseAccounts | attr:'manageDatabase' | covered | privilegeSet.fileOptions.canManageDatabase |  |
| parseAccounts | attr:'membercount' | derived | derived from read:privilegeSet listing total | Legacy fallback when the catalog lists no members; fm's listing reports total and returned. |
| parseAccounts | attr:'name' | covered | account.name + privilegeSet.name + extendedPrivilege.name | fm reports account names even where the SaXML export omits them, so s.accounts.acc.names_hidden becomes moot. |
| parseAccounts | attr:'type' | covered | account.userType | FileMaker / OAuth / ExternalServer. |
| parseAccounts | qs:':scope > ObjectList' | covered | items[] on the listing | Structural. |
| parseAccounts | qs:'AccountsCatalog' | covered | read:account listing |  |
| parseAccounts | qs:'Authentication' | covered | account.hasPassword |  |
| parseAccounts | qs:'ExtendedPrivilegesCatalog' | covered | read:extendedPrivilege listing |  |
| parseAccounts | qs:'Other' | covered | privilegeSet.fileOptions | The whole Other attribute block maps onto fileOptions. |
| parseAccounts | qs:'PasswordEncrypted' | gap | catalog-modification-info | Whether an account carries a password. fm 0.6.0's account.hasPassword does NOT track it: it equals (userType == fileMakerUser) on all 13 Ooe accounts (account 14 has no PasswordEncrypted yet reads true; the seven external/OAuth accounts carry one and read false). Register: account:* "password set" gap (Task 11); the blank-password observation cannot be built on hasPassword. Gap id kept under catalog-modification-info pending a dedicated id in the register. |
| parseAccounts | qs:'PrivilegeSetReference' | covered | account.privilegeSet |  |
| parseAccounts | qs:'PrivilegeSetsCatalog' | covered | read:privilegeSet listing |  |
| parseAccounts | qsa:':scope > Account' | covered | read:account items[] |  |
| parseAccounts | qsa:':scope > ExtendedPrivilege' | covered | read:extendedPrivilege items[] |  |
| parseAccounts | qsa:':scope > PrivilegeSet' | covered | read:privilegeSet items[] |  |
| parseAccounts | qsa:'PrivilegeSetReference' | covered | extendedPrivilege.privilegeSets[] | Per-extended-privilege set count; needs a read:extendedPrivilege describe by id, which the listing does not carry. |
| parseCustomFunctions | attr:'id' | covered | customFunction.id |  |
| parseCustomFunctions | attr:'name' | covered | customFunction.name |  |
| parseCustomFunctions | qs:'CustomFunctionsCatalog' | covered | read:customFunction listing |  |
| parseCustomFunctions | qs:'Display' | covered | customFunction.prototype | The signature string. fm also reports arity and parameters[] directly, so the legacy's split-on-semicolon param count is no longer needed. |
| parseCustomFunctions | qs:'ObjectList' | covered | read:customFunction items[] | Structural. |
| parseCustomFunctions | qsa:':scope > CustomFunction' | covered | read:customFunction items[] | The listing is a tree; type discriminates customFunction from folder. |
| parseCustomFunctions | qsa:'CalcsForCustomFunctions CustomFunction' | covered | customFunction.body | Recursion detection is the same substring test on this text. |
| parseCustomFunctions | qsa:'Chunk[type="CustomFunctionRef"]' | derived | derived from calculation text across catalogs + customFunction.name index | No DDR token stream, so per-function reference counts must be recovered by scanning every calculation string for each function name. |
| parsePersistentStores | attr:'accountName' | gap | catalog-modification-info | The account that last changed the store. |
| parsePersistentStores | attr:'id' | covered | persistentData.id |  |
| parsePersistentStores | attr:'instanceID' | covered | persistentData.instance.name |  |
| parsePersistentStores | attr:'modifications' | gap | catalog-modification-info | Modification counter on the store's UUID element. |
| parsePersistentStores | attr:'name' | covered | persistentData.key |  |
| parsePersistentStores | attr:'timestamp' | gap | catalog-modification-info | Last-modified timestamp. |
| parsePersistentStores | attr:'type' | covered | persistentData.dataType |  |
| parsePersistentStores | attr:'userName' | gap | catalog-modification-info | The user that last changed the store. |
| parsePersistentStores | qs:':scope > UUID' | gap | catalog-modification-info | Carries all four audit attributes plus the store's UUID; fm reports none of them. |
| parsePersistentStores | qs:':scope > Value' | covered | persistentData.value |  |
| parsePersistentStores | qs:'Data' | covered | persistentData.value | fm returns the payload directly, without the StyledText wrapper. |
| parsePersistentStores | qs:'PersistentStoreCatalog' | covered | read:persistentData listing |  |
| parsePersistentStores | qsa:':scope > PersistentStore' | covered | read:persistentData items[] |  |
| parseBrokenReferences | attr:'fieldtype' | covered | field.options.fieldType | Labels a finding as a calc field vs a plain field calc. |
| parseBrokenReferences | attr:'id' | covered | field.options.autoEnter.lookup.source + script.problems[] + tableOccurrence.table.resolved | The legacy uses id=0 / empty name as the dangle marker; fm resolves references by name and flags the broken ones in script.problems[] and table.resolved. |
| parseBrokenReferences | attr:'name' | covered | table.name + field.name + script.name + layout.name + valueList.name | Names the parent of each finding. |
| parseBrokenReferences | attr:'type' | covered | field.options.autoEnter.type + valueList.type |  |
| parseBrokenReferences | attr:'value' | covered | valueList.type | Source value = FromField gate for the value-list source check. |
| parseBrokenReferences | qs:':scope > AutoEnter' | covered | field.options.autoEnter | Auto-enter calc bodies are scanned for the <Field Missing> marker, which fm reproduces verbatim in calculation text (confirmed in the samples). |
| parseBrokenReferences | qs:':scope > BaseTableReference' | covered | field.table | Names the table a finding belongs to. |
| parseBrokenReferences | qs:':scope > Field > ' | covered | valueList.field + valueList.secondField | Truncated selector for ':scope > Field > PrimaryField\|SecondaryField'; fm reports both arms with occurrence and field. |
| parseBrokenReferences | qs:':scope > LeftTable' | covered | relation.left |  |
| parseBrokenReferences | qs:':scope > Name' | covered | script.body[].step | Step label for a script-step finding. |
| parseBrokenReferences | qs:':scope > ObjectList' | covered | items[] on each listing | Structural. |
| parseBrokenReferences | qs:':scope > RightTable' | covered | relation.right |  |
| parseBrokenReferences | qs:':scope > ScriptReference' | covered | script.name | Resolves the owning script of a step finding. |
| parseBrokenReferences | qs:':scope > Source' | covered | valueList.type |  |
| parseBrokenReferences | qs:':scope > Validation' | covered | field.options.validation.calculation.text |  |
| parseBrokenReferences | qs:'FieldReference' | covered | field.options.autoEnter.lookup.source.{occurrence,field} | A broken lookup source reads back as an empty source field rather than id=0. |
| parseBrokenReferences | qs:'LayoutCatalog' | covered | read:layout listing |  |
| parseBrokenReferences | qs:'Looked_up' | covered | field.options.autoEnter.lookup |  |
| parseBrokenReferences | qs:'RelationshipCatalog' | covered | read:relation listing |  |
| parseBrokenReferences | qs:'ScriptCatalog' | covered | read:script listing |  |
| parseBrokenReferences | qs:'StepsForScripts' | covered | read:script {id} describe | fm also reports script.problems[], its own live re-check of unresolved field, layout, script and calculation references - a stronger signal than the <Field Missing> string scan. |
| parseBrokenReferences | qs:'TableOccurrenceReference' | covered | relation.left.name + relation.right.name |  |
| parseBrokenReferences | qs:'ValueListCatalog' | covered | read:valueList listing |  |
| parseBrokenReferences | qsa:':scope > Calculation' | covered | field.options.calculation.text + field.options.validation.calculation.text |  |
| parseBrokenReferences | qsa:':scope > Condition' | gap | catalog-conditional-formatting | One conditional-formatting rule and its calculation. No layout object key reports conditional formatting at all. |
| parseBrokenReferences | qsa:':scope > Field' | covered | read:field items[] |  |
| parseBrokenReferences | qsa:':scope > Relationship' | covered | read:relation items[] |  |
| parseBrokenReferences | qsa:':scope > Script' | covered | read:script items[] |  |
| parseBrokenReferences | qsa:':scope > Step' | covered | script.body[] |  |
| parseBrokenReferences | qsa:':scope > ValueList' | covered | read:valueList items[] |  |
| parseBrokenReferences | qsa:'CalcsForCustomFunctions CustomFunction' | covered | customFunction.body |  |
| parseBrokenReferences | qsa:'Calculation' | covered | calculation-valued keys across field, script.body[], layout objects and customFunction.body | fm returns FileMaker's own <Field Missing> / <Table Missing> tokens inside the text, so the same substring count works. |
| parseBrokenReferences | qsa:'Conditions > Formatting' | gap | catalog-conditional-formatting | The conditional-formatting block on a layout object. |
| parseBrokenReferences | qsa:'Conditions > Hide' | covered | layout.contents.objects[].hideCondition | Reported as the calculation text, so the marker scan is unchanged. |
| parseBrokenReferences | qsa:'FieldCatalog' | covered | read:field {table} per table | Structural. |
| parseBrokenReferences | qsa:'Layout' | covered | read:layout items[] |  |
| parseBrokenReferences | qsa:'Portal' | gap | catalog-portal-setup | Here the selector exists only to reach the portal's filter Calculation, which fm reports nowhere. |
| parseBrokenReferences | qsa:'Script' | covered | read:script items[] |  |
| parseBrokenReferences | qsa:'Tooltip' | covered | layout.contents.objects[].tooltip | Reported as the calculation text. |
| parseGlobalVars | attr:'value' | covered | script.body[].name | The Set Variable target name, including names containing spaces. |
| parseGlobalVars | qsa:'Chunk[type="VariableReference"]' | gap | catalog-calculation-tokens | FileMaker's own parse of each calculation (the FM 2026 DDR_INFO chunk list) names every $$ variable a formula reads. fm returns calculation text only, and validate:calculation reports valid/invalid plus one error position, not the tokens. So the global-variables tab must find $$ names by scanning text, which is approximate for names with spaces ($$SMTP Server, valid in FileMaker), names inside comments, and names inside string literals. |
| parseGlobalVars | qsa:'StepsForScripts Parameter[type="Variable"] > Name[value]' | covered | script.body[].name | Set Variable targets; confirmed on step 141 in the samples. |
| parseCustomMenus | attr:'membercount' | derived | derived from read:customMenuSet listing total | Legacy fallback when the catalog lists no members. |
| parseCustomMenus | attr:'name' | covered | customMenu.name + customMenuSet.name |  |
| parseCustomMenus | attr:'value' | covered | customMenu.baseMenuID | Base value marks a menu as a modified built-in rather than a new custom menu. |
| parseCustomMenus | qs:':scope > Base' | covered | customMenu.baseMenuID + customMenu.inheritedMenu |  |
| parseCustomMenus | qs:':scope > ObjectList' | covered | items[] on the listing | Structural. |
| parseCustomMenus | qs:'CustomMenuCatalog' | covered | read:customMenu listing |  |
| parseCustomMenus | qs:'CustomMenuSetCatalog' | covered | read:customMenuSet listing |  |
| parseCustomMenus | qs:'MenuItemList' | covered | customMenu.items[] | Item count is items.length; needs a describe, the listing has name/id/position only. |
| parseCustomMenus | qsa:':scope > CustomMenu' | covered | read:customMenu items[] |  |
| parseCustomMenus | qsa:':scope > CustomMenuSet' | covered | read:customMenuSet items[] |  |
| parseThemeStyleCss | qsa:'CSS' | covered | `read:theme` describe `css` | The theme's whole stylesheet. fm 0.7.0's theme describe returns the same text the SaXML CDATA carried, as one `css` string, so every per-style colour, font, border and fill in the Themes tab still has to be parsed out of the CSS text exactly as the legacy parsed it out of the CDATA. |
| parseThemes | attr:'custom' | covered | `read:theme` describe `isCustom` | Marks a theme as developer-made rather than shipped. fm also reports `isDefault` and `isDeprecated` alongside it. |
| parseThemes | attr:'isCustom' | covered | `read:theme` describe `isCustom` | Alternate spelling of the same flag; one fm key answers both. |
| parseThemes | attr:'name' | covered | `read:theme` describe `name` | The theme's internal id. `read:theme` lists every theme defined in the file, so a theme no layout wears is visible now; `layout.theme.{id,name,displayName,group}` still names the theme each layout wears. |
| parseThemes | qs:':scope > Display' | covered | `read:theme` describe `displayName` | The theme's human-readable name; `group` names the family it is filed under. |
| parseThemes | qs:'Display' | covered | `read:theme` describe `displayName` | Fallback selector for the same name. |
| parseThemes | qs:'Metadata' | covered | `read:theme` describe `namedStyleNames` + `colorPalette.swatch1..5` | Structural wrapper that held the theme's namedstyles list and colour elements; fm returns both as keys on the theme describe. The metadata this element also carried that fm does not report - base theme name and version, locale, platform, theme version, chart colour scheme, the 24 layout-builder metrics, the tag list and modification who/when - stays on the register's `theme` entry. |
| parseThemes | qs:'ThemeCatalog' | covered | `read:theme` list `items[]` | The list of themes defined in the file. |
| parseThemes | qs:'namedstyles' | covered | `read:theme` describe `namedStyleNames` | The per-theme style list: one key per named style, its value the style's display name. style_count and the unused-style detection both read it. On ooe fm returns 94 of the 95 style keys the legacy finds; the 95th is defined on the second theme only. |
| parseThemes | qsa:':scope > Theme' | covered | `read:theme` list `items[]` | Iterating the themes; fm returns the array, then a describe per theme. |
| parseThemes | qsa:'color,Color' | covered | `read:theme` describe `colorPalette.swatch1..5` | The theme palette, five swatches. The colours individual styles use are inside the `css` text, not broken out as keys. |
| parseExternalSources | attr:'direction' | covered | authorization.type | inbound / outbound. |
| parseExternalSources | attr:'driver' | covered | externalDataSource.dsn (DSN, not the ODBC driver name) | fm reports the ODBC data source name, not the driver; sourceType 'odbc' still names the kind. |
| parseExternalSources | attr:'file' | covered | authorization.filenames[] | Plus filenamesRaw. |
| parseExternalSources | attr:'name' | covered | externalDataSource.name + authorization.filenames[] |  |
| parseExternalSources | attr:'source' | covered | authorization.authorizedBy |  |
| parseExternalSources | attr:'type' | covered | externalDataSource.sourceType + authorization.type |  |
| parseExternalSources | qs:'ExternalDataSourcesCatalog' | covered | read:externalDataSource {detail:true} listing |  |
| parseExternalSources | qs:'FileAccessCatalog' | covered | read:authorization listing | Also reports tampered, hasHash, hasToken and authorizedAt, which the legacy never had. |
| parseExternalSources | qs:'ODBCDataSourceCatalog' | covered | read:externalDataSource items[] with sourceType = odbc | fm folds ODBC sources into the one external-data-source catalog. |
| parseExternalSources | qsa:':scope > DataSource, :scope > ODBCDataSource' | covered | read:externalDataSource items[] with sourceType = odbc |  |
| parseExternalSources | qsa:':scope > ExternalDataSource' | covered | read:externalDataSource items[] |  |
| parseExternalSources | qsa:':scope > FileAccess, :scope > ObjectList > Authorization' | covered | read:authorization items[] |  |
| parseExternalSources | qsa:'FilePathList > FilePath' | covered | externalDataSource.paths[] | multi_target is paths.length > 1. |
| parseBaseDirectories | attr:'name' | covered | baseDirectory.path | Plus baseDirectory.absolutePath. |
| parseBaseDirectories | attr:'relativeTo' | covered | baseDirectory.relative |  |
| parseBaseDirectories | qs:'BaseDirectoryCatalog' | covered | read:baseDirectory listing |  |
| parseBaseDirectories | qsa:':scope > BaseDirectory' | covered | read:baseDirectory items[] |  |
| parsePlugins | attr:'type' | gap | catalog-plugins | Chunk type ExternalFunctionRef / PluginFunction / PluginFunctionRef, which is how a plugin call is told apart from a native function. |
| parsePlugins | qsa:'Chunk' | gap | catalog-plugins | The DDR chunk stream the whole plugin tab is built from. Plugin call sites survive as raw text inside calculations, but nothing marks them as plugin calls, so the native-function mistagging list and the per-sub-function call tally both lose their source. |
| parseTags | attr:'isFolder' | covered | layout.type + script.type |  |
| parseTags | qs:':scope > ObjectList' | covered | items[] on each listing | Structural. |
| parseTags | qs:':scope > TagList' | gap | catalog-tags | fm reports tags on fields (options.tags), table occurrences, custom menus and custom menu sets, but not on layouts or scripts. s.tags.tagged_layouts and tagged_scripts, and their share of tag_counts, have no source. |
| parseTags | qs:'LayoutCatalog' | covered | read:layout listing |  |
| parseTags | qs:'ScriptCatalog' | covered | read:script listing |  |
| parseTags | qs:'TableOccurrenceCatalog' | covered | read:tableOccurrence listing |  |
| parseTags | qsa:':scope > Field[fieldtype]' | covered | read:field items[] with options.tags |  |
| parseTags | qsa:':scope > TableOccurrence' | covered | read:tableOccurrence items[] with tags | tags needs a describe by id. |
| parseTags | qsa:'FieldCatalog' | covered | read:field {table} per table | Structural. |
| parseTags | qsa:'Layout' | covered | read:layout items[] | Iteration is covered; the TagList read on each layout is the gap (catalog-tags). |
| parseTags | qsa:'Script' | covered | read:script items[] | Iteration is covered; the TagList read on each script is the gap (catalog-tags). |
| parseModifications | attr:'Display' | covered | layout.theme.displayName + customFunction.prototype | Fallback name for an object with no name attribute. Where that object is a Theme, `read:theme` names it (`displayName`). |
| parseModifications | attr:'modifications' | gap | catalog-modification-info | The per-object modification counter that the whole hotspots tab ranks on. Not reported for any object, layouts included - layout.modified carries who and when, never how many. The counter itself is DDR bookkeeping; the ask to Claris is the who/when triple (account, user name, timestamp) on every catalog, which fm reports for layouts only (register: catalog-modification-info). |
| parseModifications | attr:'name' | covered | the name key of each catalog | Names the modified object. |
| parseModifications | attr:'timestamp' | gap | catalog-modification-info | Last-modified timestamp. Covered for layouts only, by layout.modified.timestamp. |
| parseModifications | attr:'userName' | gap | catalog-modification-info | Last-modifying user. Covered for layouts only, by layout.modified.by / layout.modified.account. |
| parseModifications | qsa:'UUID[modifications]' | gap | catalog-modification-info | The audit element on fields, tables, layouts, scripts, TOs, themes, custom functions, custom menus, value lists and privilege sets. Only layouts have an fm equivalent (layout.modified), and it carries no count. |
| parseBitFlags | attr:'Options' | gap | catalog-layout-parts | Part Definition options word. fm 0.7.0 does report the parts themselves (`layout.parts[]{type,height,offset,name,breakField}`); what is missing is the options word behind page breaks, page numbering, alternate row state and active row state. The Bit Flags tab is retired: it catalogued raw option words because SaXML leaves them undecoded; fm reports every option as a named key, so there is nothing to decipher. |
| parseBitFlags | attr:'inputMode' | covered | layout.contents.objects[].inputMode + keyboardType | fm reports the decoded word (automatic, roman, ...) instead of the raw option number. The raw number only mattered to the retired Bit Flags tab. The Bit Flags tab is retired: it catalogued raw option words because SaXML leaves them undecoded; fm reports every option as a named key, so there is nothing to decipher. |
| parseBitFlags | attr:'name' | covered | layout.name | Only used as the source label on a flag row. |
| parseBitFlags | attr:'show' | gap | catalog-portal-setup | Portal 'show' bits: delete is covered by objects[].allowDelete; create, sort and filter are the portal-setup gap (fm help: sort and filter are 'reported nowhere yet'). The Bit Flags tab is retired: it catalogued raw option words because SaXML leaves them undecoded; fm reports every option as a named key, so there is nothing to decipher. |
| parseBitFlags | attr:'type' | covered | layout.contents.objects[].type + objects[].control | Object kind and field control style (editBox, checkboxSet, popupMenu, ...) are both named keys. Part types are `layout.parts[].type`; only the raw part type code is still unreported (catalog-layout-parts). The Bit Flags tab is retired: it catalogued raw option words because SaXML leaves them undecoded; fm reports every option as a named key, so there is nothing to decipher. |
| parseBitFlags | qs:':scope > Field' | covered | layout.contents.objects[].{field, control, browseEntry, findEntry, exitOnTab, exitOnReturn, exitOnEnter, selectContentsOnEntry, autoComplete, ...} | Every field-object option word is decoded into named keys (about 45 on a field object). The Bit Flags tab is retired: it catalogued raw option words because SaXML leaves them undecoded; fm reports every option as a named key, so there is nothing to decipher. |
| parseBitFlags | qs:':scope > Options' | covered | layout.flags.{raw,set} + layout.contents.objects[].<named keys> + account.{enabled,forceExpire,hasPassword} | The raw option word survives only on layouts (flags.raw beside flags.set naming 22 bits); everywhere else fm reports the decoded keys and not the number. The Bit Flags tab is retired: it catalogued raw option words because SaXML leaves them undecoded; fm reports every option as a named key, so there is nothing to decipher. |
| parseBitFlags | qs:':scope > Portal' | covered | layout.contents.objects[].{allowDelete, rows, initialRow, allowVerticalScrolling, scrollBarVisibility, resetScrollBarOnExit} | Portal option words decoded; create/sort/filter are catalog-portal-setup. The Bit Flags tab is retired: it catalogued raw option words because SaXML leaves them undecoded; fm reports every option as a named key, so there is nothing to decipher. |
| parseBitFlags | qs:':scope > Usage' | covered | layout.contents.objects[].{control, inputMode, keyboardType, repetitionCount, repetitionOrientation} | Field Usage word decoded into named keys. The Bit Flags tab is retired: it catalogued raw option words because SaXML leaves them undecoded; fm reports every option as a named key, so there is nothing to decipher. |
| parseBitFlags | qs:'AccountsCatalog' | covered | account.{enabled, forceExpire, hasPassword, userType, privilegeSet} | The catalog-level options word is not reported, but each account's attributes are decoded; the word's own meaning was never documented. The Bit Flags tab is retired: it catalogued raw option words because SaXML leaves them undecoded; fm reports every option as a named key, so there is nothing to decipher. |
| parseBitFlags | qs:'Definition' | gap | catalog-layout-parts | Part Definition: options word and part type. The part type is `layout.parts[].type` now; the definition kind and the options word are not reported. The Bit Flags tab is retired: it catalogued raw option words because SaXML leaves them undecoded; fm reports every option as a named key, so there is nothing to decipher. |
| parseBitFlags | qs:'LayoutCatalog' | covered | read:layout (flatten) + layout.flags | Entry point for the layout flag group; layout.flags.set names 22 bits and flags.raw carries the word. The Bit Flags tab is retired: it catalogued raw option words because SaXML leaves them undecoded; fm reports every option as a named key, so there is nothing to decipher. |
| parseBitFlags | qsa:'Layout' | covered | layout.flags.{raw,set} | Per-layout options word, decoded and raw. The Bit Flags tab is retired: it catalogued raw option words because SaXML leaves them undecoded; fm reports every option as a named key, so there is nothing to decipher. |
| parseBitFlags | qsa:'LayoutObject' | covered | layout.contents.objects[].<named keys> | Per-object options word decoded into named keys (locked, hideWhenPrinting, slideLeft, slideUp, resizeEnclosingPart, applyInFindMode and the kind-specific ones). The Bit Flags tab is retired: it catalogued raw option words because SaXML leaves them undecoded; fm reports every option as a named key, so there is nothing to decipher. |
| parseBitFlags | qsa:'Part' | gap | catalog-layout-parts | Per-part options word. The parts are reported (`layout.parts[]`), the options word is not. The Bit Flags tab is retired: it catalogued raw option words because SaXML leaves them undecoded; fm reports every option as a named key, so there is nothing to decipher. |
| parseDeepAnalysis | attr:'enable' | covered | script.body[].disabled | Disabled steps are skipped by every script-issue check; fm marks them with disabled true. |
| parseDeepAnalysis | attr:'fieldtype' | covered | field.options.fieldType |  |
| parseDeepAnalysis | attr:'global' | covered | field.options.global | stored_with_globals check. |
| parseDeepAnalysis | attr:'id' | covered | script.body[].stepID + field.id + layout.id | Step ids are the same FileMaker numbers the legacy's FM_STEP_IDS table keys on, and fm reports step alongside stepID so the dictionary becomes optional. |
| parseDeepAnalysis | attr:'index' | covered | field.options.indexing |  |
| parseDeepAnalysis | attr:'name' | covered | table.name + field.name + script.name + layout.name |  |
| parseDeepAnalysis | attr:'state' | covered | script.body[].on + script.body[].with dialog | Confirmed in the samples: Set Error Capture and Allow User Abort report on; Send Mail reports with dialog, already de-inverted. |
| parseDeepAnalysis | attr:'storeCalculationResults' | covered | field.options.stored |  |
| parseDeepAnalysis | attr:'type' | covered | script.body[].name + script.body[].storage | Parameter type Variable becomes the Set Variable name key; DialogOptions Storage type becomes storage (userChoice / embedOnly, seen in the samples). |
| parseDeepAnalysis | attr:'value' | covered | script.body[].name | The Set Variable target name. |
| parseDeepAnalysis | qs:':scope > BaseTableReference' | covered | field.table |  |
| parseDeepAnalysis | qs:':scope > ObjectList' | covered | items[] on each listing | Structural. |
| parseDeepAnalysis | qs:':scope > ScriptReference' | covered | script.body[].script |  |
| parseDeepAnalysis | qs:':scope > Storage' | covered | field.options.{global,stored,indexing} |  |
| parseDeepAnalysis | qs:'BaseTableCatalog' | covered | read:table listing | Builds the base-table name index used to spot related-field references in calc text. |
| parseDeepAnalysis | qs:'Calculation' | covered | field.options.*.calculation.text + script.body[] calculation-valued keys |  |
| parseDeepAnalysis | qs:'CustomMenuCatalog' | covered | read:customMenu listing |  |
| parseDeepAnalysis | qs:'DialogOptions > Storage' | covered | script.body[].storage | Insert File storage; the samples show userChoice and embedOnly. |
| parseDeepAnalysis | qs:'LayoutCatalog' | covered | read:layout listing |  |
| parseDeepAnalysis | qs:'LayoutReference' | covered | script.body[].layout + script.body[].layout by calculation | The legacy's id=0-plus-Calculation test for a layout chosen by calculation is a separate key in fm. |
| parseDeepAnalysis | qs:'Name' | covered | script.body[].name |  |
| parseDeepAnalysis | qs:'NoInteract' | covered | script.body[].with dialog | fm reports the dialog setting the way Pro does, so the Send Mail inversion the legacy has to special-case disappears. |
| parseDeepAnalysis | qs:'ObjectList' | covered | items[] on each listing | Structural. |
| parseDeepAnalysis | qs:'Parameter[type="Variable"]' | covered | script.body[].name on Set Variable |  |
| parseDeepAnalysis | qs:'Set' | covered | script.body[].on | Set Error Capture and Allow User Abort state. |
| parseDeepAnalysis | qs:'StepsForScripts' | covered | read:script {id} describe |  |
| parseDeepAnalysis | qs:'Value > Calculation' | covered | script.body[].value | Set Variable / Set Field right-hand side. |
| parseDeepAnalysis | qsa:':scope > Field[fieldtype]' | covered | read:field items[] |  |
| parseDeepAnalysis | qsa:':scope > Script' | covered | read:script items[] |  |
| parseDeepAnalysis | qsa:':scope > Step' | covered | script.body[] |  |
| parseDeepAnalysis | qsa:'BaseTable' | covered | read:table items[] |  |
| parseDeepAnalysis | qsa:'Calculation' | covered | calculation-valued keys across field, script.body[] and layout objects |  |
| parseDeepAnalysis | qsa:'FieldCatalog' | covered | read:field {table} per table | Structural. |
| parseDeepAnalysis | qsa:'LayoutObject' | covered | layout.contents.objects[] |  |
| parseDeepAnalysis | qsa:'Part' | covered | layout.parts[] | Part iteration for the layout-side checks; fm 0.7.0 reports the array at the layout's top level. |
| parseDeepAnalysis | qsa:'StepsForScripts Calculation' | covered | script.body[] calculation-valued keys | value, condition, parameter, calculation and slots.calc.* carry every formula the expensive-function and dead-variable scans read. |
| parseUnreferenced | attr:'UUID' | derived | derived from layout.contents.objects[].valueList.{id,name} | fm has no ValueListReference UUID; the used/unused join is by id or name. |
| parseUnreferenced | attr:'datatype' | covered | field.type | Shown on the unreferenced-field drill-down. |
| parseUnreferenced | attr:'displayName' | covered | layout.contents.objects[].style | The named style an object wears. The theme-side list of all defined styles, which is what turns this into an unused-style report, is `read:theme` describe `namedStyleNames`. |
| parseUnreferenced | attr:'enable' | covered | script.body[].disabled |  |
| parseUnreferenced | attr:'fieldtype' | covered | field.options.fieldType |  |
| parseUnreferenced | attr:'global' | covered | field.options.global |  |
| parseUnreferenced | attr:'id' | covered | the id key of each catalog | fm ids are stable across listing and describe, so the id-keyed defined/referenced maps port unchanged. |
| parseUnreferenced | attr:'index' | covered | field.options.indexing |  |
| parseUnreferenced | attr:'isFolder' | covered | layout.type + script.type |  |
| parseUnreferenced | attr:'name' | covered | the name key of each catalog |  |
| parseUnreferenced | attr:'type' | covered | layout.contents.objects[].type + valueList.type |  |
| parseUnreferenced | qs:':scope > AutoEnter' | covered | field.options.autoEnter |  |
| parseUnreferenced | qs:':scope > BaseTableReference' | covered | field.table + tableOccurrence.table |  |
| parseUnreferenced | qs:':scope > Calculation' | covered | field.options.calculation.text |  |
| parseUnreferenced | qs:':scope > Comment' | covered | field.options.comment | Shown on the unreferenced-field drill-down so a developer can judge before deleting. |
| parseUnreferenced | qs:':scope > Display' | covered | customFunction.prototype + layout.theme.displayName |  |
| parseUnreferenced | qs:':scope > LeftTable TableOccurrenceReference' | covered | relation.left.name |  |
| parseUnreferenced | qs:':scope > LeftTable' | covered | relation.left |  |
| parseUnreferenced | qs:':scope > ObjectList' | covered | items[] on each listing | Structural. |
| parseUnreferenced | qs:':scope > RightTable TableOccurrenceReference' | covered | relation.right.name |  |
| parseUnreferenced | qs:':scope > RightTable' | covered | relation.right |  |
| parseUnreferenced | qs:':scope > ScriptReference' | covered | script.body[].script + layout.scriptTriggers[].script |  |
| parseUnreferenced | qs:':scope > Storage' | covered | field.options.{global,indexing} |  |
| parseUnreferenced | qs:':scope > TableOccurrenceReference' | covered | layout.tableOccurrence + tableOccurrence.related[] |  |
| parseUnreferenced | qs:':scope > UUID' | derived | derived from the id key of each catalog | fm exposes no per-object UUID for schema objects (script steps and menu items carry uuids; authorization.uuid is the PAIRED file's UUID, not the element's; graphNote has its own); ids serve the same identity role for the used/unused join. |
| parseUnreferenced | qs:':scope > UUID, :scope > ObjectList, :scope > Bounds' | derived | derived from the id key of each catalog + layout.contents.objects[].bounds | Legacy shape-sniffing to tell one node kind from another; fm returns typed objects, so the sniff is unnecessary. |
| parseUnreferenced | qs:':scope > Validation' | covered | field.options.validation |  |
| parseUnreferenced | qs:'BaseTableCatalog' | covered | read:table listing |  |
| parseUnreferenced | qs:'BaseTableSourceReference > BaseTableReference' | covered | tableOccurrence.table | An unreferenced base table is one no occurrence's table points at. |
| parseUnreferenced | qs:'Display' | covered | customFunction.prototype |  |
| parseUnreferenced | qs:'LayoutCatalog' | covered | read:layout listing |  |
| parseUnreferenced | qs:'LayoutReference' | covered | script.body[].layout |  |
| parseUnreferenced | qs:'LayoutReference[id="0"]' | covered | script.body[].layout by calculation | Drives s.unrefs.layouts_dynamic_warning: a Go to Layout chosen by calculation means the unreferenced-layout list cannot be trusted. |
| parseUnreferenced | qs:'LeftField > FieldReference' | covered | relation.predicates[].leftField |  |
| parseUnreferenced | qs:'Metadata > namedstyles' | covered | `read:theme` describe `namedStyleNames` | The per-theme list of defined styles. Subtracting the used set from it is what produces s.unrefs.unused_styles and unused_styles_detail. |
| parseUnreferenced | qs:'RelationshipCatalog' | covered | read:relation listing |  |
| parseUnreferenced | qs:'RightField > FieldReference' | covered | relation.predicates[].rightField |  |
| parseUnreferenced | qs:'ScriptCatalog' | covered | read:script listing |  |
| parseUnreferenced | qs:'ScriptReference' | covered | script.body[].script + layout.contents.objects[].action.script + layout.scriptTriggers[].script |  |
| parseUnreferenced | qs:'StepsForScripts' | covered | read:script {id} describe |  |
| parseUnreferenced | qs:'TableOccurrenceCatalog' | covered | read:tableOccurrence listing |  |
| parseUnreferenced | qs:'TableOccurrenceReference' | covered | layout.tableOccurrence + relation.left/right + layout.contents.objects[].field.tableOccurrence |  |
| parseUnreferenced | qs:'Text' | covered | field.options.calculation.text | The CDATA formula child of a Calculation. |
| parseUnreferenced | qs:'ThemeCatalog' | covered | `read:theme` list `items[]` | Enumerates every theme, each then described for its style list. |
| parseUnreferenced | qs:'ValueListCatalog' | covered | read:valueList listing |  |
| parseUnreferenced | qsa:':scope > Calculation' | covered | field.options.*.calculation.text |  |
| parseUnreferenced | qsa:':scope > Field[fieldtype]' | covered | read:field items[] |  |
| parseUnreferenced | qsa:':scope > ObjectList > Field, :scope > Field' | covered | read:field items[] | Handles both SaXML field-catalog shapes; fm has one. |
| parseUnreferenced | qsa:':scope > TableOccurrence' | covered | read:tableOccurrence items[] |  |
| parseUnreferenced | qsa:':scope > Theme' | covered | `read:theme` list `items[]` |  |
| parseUnreferenced | qsa:':scope > ValueList' | covered | read:valueList items[] |  |
| parseUnreferenced | qsa:'BaseTable' | covered | read:table items[] |  |
| parseUnreferenced | qsa:'BaseTableReference' | covered | tableOccurrence.table + field.table |  |
| parseUnreferenced | qsa:'CalcsForCustomFunctions CustomFunction' | covered | customFunction.body | Scanned for field and TO references made from custom functions. |
| parseUnreferenced | qsa:'Calculation' | covered | calculation-valued keys across field, script.body[], layout objects and customFunction.body |  |
| parseUnreferenced | qsa:'Conditions > Formatting > Condition > Calculation' | gap | catalog-conditional-formatting | A field referenced only from a conditional-formatting calculation will be reported unreferenced, which is a false positive rather than a missing number. |
| parseUnreferenced | qsa:'Conditions > Hide > Calculation' | covered | layout.contents.objects[].hideCondition |  |
| parseUnreferenced | qsa:'FieldCatalog' | covered | read:field {table} per table | Structural. |
| parseUnreferenced | qsa:'FieldReference' | covered | layout.contents.objects[].field + relation.predicates[] + field.options.autoEnter.lookup.source |  |
| parseUnreferenced | qsa:'JoinPredicate' | covered | relation.predicates[] |  |
| parseUnreferenced | qsa:'Layout' | covered | read:layout items[] |  |
| parseUnreferenced | qsa:'LayoutObject LocalCSS' | gap | catalog-object-styles | Collects the style names layout objects actually use. layout.contents.objects[].style gives the display name for an object wearing a named style, but an object carrying local CSS and no style name is silent, so the used-style set is incomplete. |
| parseUnreferenced | qsa:'Part LocalCSS' | gap | catalog-layout-parts | Styles used by layout part bands. `layout.parts[]` carries geometry, name and break field only - no style name and no CSS - so styles worn by a part cannot join the used-style set. |
| parseUnreferenced | qsa:'Portal > Calculation' | gap | catalog-portal-setup | The portal filter calculation. A field referenced only from a portal filter will be reported unreferenced. |
| parseUnreferenced | qsa:'Relationship Calculation' | dropped | owner ruling 2026-09-14 | The legacy code speculatively queried a Calculation element under Relationship ("rare, but possible"). FileMaker has no calculation-based join predicates (owner confirmed), so the query never matched and nothing is lost. relation.predicates[] carries leftField, op, rightField. |
| parseUnreferenced | qsa:'Relationship' | covered | read:relation items[] |  |
| parseUnreferenced | qsa:'Script' | covered | read:script items[] |  |
| parseUnreferenced | qsa:'ScriptReference' | covered | script.body[].script + layout.contents.objects[].action.script + layout.scriptTriggers[].script |  |
| parseUnreferenced | qsa:'Step Calculation' | covered | script.body[] calculation-valued keys |  |
| parseUnreferenced | qsa:'Step LayoutReference' | covered | script.body[].layout |  |
| parseUnreferenced | qsa:'Step' | covered | script.body[] |  |
| parseUnreferenced | qsa:'StepsForScripts > Script' | covered | read:script {id} describe per script |  |
| parseUnreferenced | qsa:'StyledText > Data' | covered | layout.contents.objects[].text + layout.contents.objects[].mergeFields[] | Merge-field references inside layout text; fm resolves each merge field to name, id and tableOccurrence rather than leaving it in the text. |
| parseUnreferenced | qsa:'TableOccurrenceReference' | covered | layout.tableOccurrence + relation.left/right + tableOccurrence.related[] |  |
| parseUnreferenced | qsa:'Tooltip > Calculation' | covered | layout.contents.objects[].tooltip |  |
| parseUnreferenced | qsa:'ValueListReference' | covered | layout.contents.objects[].valueList + field.options.validation.valueList |  |
| render | s.accounts.acc.account_count | derived | derived from read:account listing total |  |
| render | s.accounts.acc.blank_password | derived | derived from account.hasPassword + account.userType | Blank password is hasPassword false on a FileMaker-type account. |
| render | s.accounts.acc.detail | covered | account.{name,userType,enabled,privilegeSet,hasPassword} | Needs one read:account describe per account; the listing carries name/id/builtIn only. |
| render | s.accounts.acc.names_hidden | derived | derived from account.name | fm reads names straight from the file, so the SaXML anonymisation this flag warns about cannot happen; the flag becomes constantly false. |
| render | s.accounts.ep.detail | covered | extendedPrivilege.{name,description,enabled,privilegeSets[]} |  |
| render | s.accounts.ep.extended_privilege_count | derived | derived from read:extendedPrivilege listing total |  |
| render | s.accounts.priv.detail | covered | privilegeSet.{name,fileOptions.*} | printAllowed, exportAllowed, canManageDatabase, noIdleDisconnect, menuCommands, dataEntryOverride. |
| render | s.accounts.priv.privilege_set_count | derived | derived from read:privilegeSet listing total |  |
| render | s.baseDirs | covered | read:baseDirectory items[] | path, absolutePath, relative, id. |
| render | s.bitflags | dropped | owner ruling 2026-09-14 | The Bit Flags tab catalogued SaXML's undecoded option words for format reverse-engineering. fm decodes every option into named keys (raw word kept only on layouts), so the tab has no purpose in the new inspector. |
| render | s.customs.custom_function_count | derived | derived from read:customFunction listing, items with type customFunction |  |
| render | s.customs.custom_function_references | derived | derived from calculation text across catalogs + customFunction.name index |  |
| render | s.customs.detail | covered | customFunction.{id,name,prototype,arity,parameters,body,comment,availableToUser} | Recursion is a substring test on body, as before. |
| render | s.deep.script_issues | derived | derived from script.body[] step keys + block + disabled | Every check the tab makes reads step options fm names explicitly (on, with dialog, storage, layout by calculation, name, value). |
| render | s.deep.scripts_dead_setvar | derived | derived from script.body[].name + the calculation-valued keys of later steps |  |
| render | s.deep.scripts_embedded_credentials | derived | derived from script.body[].{password,smtp password,open password,edit password,account,API key,oauth client secret} | fm names each credential slot, which is a better source than the legacy's text scan. |
| render | s.deep.scripts_hardcoded_account | derived | derived from script.body[].account |  |
| render | s.deep.scripts_pSoS_client_steps | derived | derived from script.body[].stepID |  |
| render | s.deep.scripts_swallowed_errors | derived | derived from script.body[].on for stepID 86 + Get(LastError) in later calculation text |  |
| render | s.deep.scripts_with_unguarded_abort_off | derived | derived from script.body[].on for stepID 85 |  |
| render | s.ext.detail | covered | externalDataSource.{name,paths,sourceType,dsn,hasData} + authorization.{type,filenames,authorizedBy} |  |
| render | s.fileMeta.encryption | covered | evaluate:calculation `Get ( EncryptionState )` | Rendered as on/off from the "0"/"1" value. |
| render | s.fileMeta.file_trigger_actions | gap | catalog-file-metadata | File-level script triggers and the scripts they call. |
| render | s.fileMeta.hide_toolbars | gap | catalog-file-metadata |  |
| render | s.fileMeta.hide_web_direct | gap | catalog-file-metadata |  |
| render | s.fileMeta.login_type | gap | catalog-file-metadata |  |
| render | s.fileMeta.min_fm_version | gap | catalog-file-metadata |  |
| render | s.fileMeta.save_password | gap | catalog-file-metadata |  |
| render | s.fileMeta.startup_layout | gap | catalog-file-metadata |  |
| render | s.globals.detail | gap | catalog-calculation-tokens | Per-variable contact counts. Set Variable targets are covered (script.body[].name) but every $$ READ inside a calculation needs the tokenised chunk stream; a regex over calculation text mis-splits names containing spaces. |
| render | s.globals.global_variable_count | gap | catalog-calculation-tokens | Same source problem; the count would be low by every read-only variable. |
| render | s.globals.max_global_contacts | gap | catalog-calculation-tokens | Same source problem. |
| render | s.graph.cascade_delete | derived | derived from relation.leftToRight.cascadeDelete + relation.rightToLeft.cascadeDelete |  |
| render | s.graph.detail.relationships_all | covered | relation.{left,right,predicates[],leftToRight,rightToLeft} | Every column including the sorted tick (sortRelated) and, since fm 0.7.0, the sort itself (`rightToLeft.sortSpec.fields[]{field,order}`); only blanksLast and maintain are unreported. |
| render | s.graph.detail.tos_all | covered | tableOccurrence.{name,table.name} |  |
| render | s.graph.relationship_count | derived | derived from read:relation listing total |  |
| render | s.graph.table_occurrence_count | derived | derived from read:tableOccurrence listing total |  |
| render | s.graph.to_zero_relationships | derived | derived from tableOccurrence.related[] (empty) or the union of relation.left/right |  |
| render | s.layouts.button_bars | derived | derived from layout.contents.objects[].type = buttonBar |  |
| render | s.layouts.detail | covered | layout.parts[].type + layout.{hidden,scriptTriggers,contents.objects[]} | with_header, with_footer, with_subsummary and with_nav_part come from `parts[].type`; the rest (all, hidden, in_sidebar, with_triggers, with_portals, with_charts, with_buttons, with_tab_controls, with_slide_controls, with_web_viewers, with_popovers, with_button_bars, dividers) were already covered. with_local_css still needs catalog-object-styles and with_filtered_portals catalog-portal-setup. |
| render | s.layouts.info | covered | layout.{id,theme,tableOccurrence,scriptTriggerCount,hidden,viewStyles,flags.set} | id, theme, base_to, triggers, hidden, default_view, allow_form/list/table, save_record (flags.set confirmRecordSave) and quick_find (flags.set disableQuickFind) are covered; menu_set is catalog-layout-menuset. |
| render | s.layouts.layout_count | derived | derived from read:layout {flatten:true} items with type = layout | Minus the hyphen-named dividers, same rule as today. |
| render | s.layouts.local_css_objects | gap | catalog-object-styles | Per-layout, per-object-type counts of local CSS overrides. |
| render | s.layouts.objects_total | derived | derived from layout.contents.objects[] counted recursively | layout.contents also reports fieldCount, portalCount, webViewerCount and unmodelledCount directly. |
| render | s.layouts.popovers | derived | derived from layout.contents.objects[].type = popoverButton and popover |  |
| render | s.layouts.portals_total | derived | derived from layout.contents.portalCount |  |
| render | s.layouts.slide_controls | derived | derived from layout.contents.objects[].type = slideControl |  |
| render | s.layouts.tab_controls | derived | derived from layout.contents.objects[].type = tabControl |  |
| render | s.layouts.web_viewers | derived | derived from layout.contents.webViewerCount |  |
| render | s.library.binary_data_count | dropped | owner ruling 2026-09-14 | Library section of the overview. Not relevant. |
| render | s.menus.custom_menu_count | derived | derived from read:customMenu listing total |  |
| render | s.menus.custom_menu_set_count | derived | derived from read:customMenuSet listing total |  |
| render | s.menus.detail | covered | customMenu.{name,items[],baseMenuID} + customMenuSet.name | Item count is items.length; modified-built-in vs new is baseMenuID. |
| render | s.mods.by_user | gap | catalog-modification-info |  |
| render | s.mods.most_recent | gap | catalog-modification-info | Covered for layouts only, by layout.modified.timestamp. |
| render | s.mods.top_modified | gap | catalog-modification-info | Ranks on the modification counter, which is reported for nothing. |
| render | s.mods.total_modifications | gap | catalog-modification-info |  |
| render | s.name | covered | `read:theme` describe `namedStyleNames.<style key>` | Theme-style row: the style's display name in the Theme Styles pane. |
| render | s.persistent.count | derived | derived from read:persistentData listing total |  |
| render | s.persistent.detail.all | gap | catalog-modification-info | name, id, instanceID, type, value and length are covered by persistentData.{key,id,instance.name,dataType,value}; the modifiedBy, account, modifiedAt, mods and uuid columns have no source. |
| render | s.plugins.detail | gap | catalog-plugins |  |
| render | s.plugins.plugin_function_count | gap | catalog-plugins |  |
| render | s.plugins.plugin_function_references | gap | catalog-plugins |  |
| render | s.scripts.detail | covered | script.{name,hidden,runWithFullAccess,steps} + script.body[] |  |
| render | s.scripts.info | covered | script.{id,folder,hidden,runWithFullAccess,steps} + script.body[] | complexity, nesting, inactive and uses_globals are computed from body[] as before. |
| render | s.scripts.max_length | derived | derived from the max of script.steps on the read:script listing | No describe needed: the listing carries a step count per script. |
| render | s.scripts.orphaned_enabled_steps | derived | derived from script.body[].disabled + script.body[].block | fm reports no block role on a disabled block step, which is exactly the wrapper-disabled case this check looks for. |
| render | s.scripts.script_count | derived | derived from read:script {flatten:true} items with type = script |  |
| render | s.scripts.step_count | derived | derived from the sum of script.steps on the read:script listing |  |
| render | s.scripts.unbalanced_if_scripts | derived | derived from script.body[].block | An unclosed If reports start with no end, so fm answers this directly instead of by counting openers and closers. |
| render | s.scripts.unbalanced_loop_scripts | derived | derived from script.body[].block | Same. |
| render | s.scripts.unknown_step_id_count | derived | derived from script.body[].step + script.problems[] | fm names every step it returns, so the unknown-id bucket collapses to zero; problems[] is the replacement drift signal. |
| render | s.tables.calc_fields | derived | derived from field.options.fieldType = calculation |  |
| render | s.tables.detail.fields_auto_entry | covered | field.options.autoEnter.type |  |
| render | s.tables.detail.fields_calc | covered | field.options.fieldType + field.options.calculation.text |  |
| render | s.tables.detail.fields_container | covered | field.options.container.{external,encrypted,fewerFolders,baseDirectory} + field.options.global/repetitions | container_mode, container_type, container_base, is_global, reps and the fewer-folders flag are all covered; verified on ooe 2026-09-14 with a secure-storage container. |
| render | s.tables.detail.fields_global | covered | field.options.global |  |
| render | s.tables.detail.fields_summary | covered | field.options.fieldType + field.options.summary.{type,field,running,individualReps} |  |
| render | s.tables.field_count | derived | derived from the sum of read:field listing total per table |  |
| render | s.tables.field_info | covered | field.{id,name,type,options.*} | Every column of the dense fields table: type, data type, global, repeating, indexed, stored/unstored calc, auto-entry kind, validation rules, comment and calc excerpt. |
| render | s.tables.fields_per_table | derived | derived from read:field listing total per table |  |
| render | s.tables.stored_calc_fields | derived | derived from field.options.stored + field.options.fieldType + field.options.global |  |
| render | s.tables.table_count | derived | derived from read:table listing total |  |
| render | s.tables.table_info | covered | table.{id,name,description} + read:field listing total | description needs a read:table describe by name. |
| render | s.tables.tables | covered | read:table items[] |  |
| render | s.tables.unstored_calc_fields | derived | derived from field.options.stored + field.options.fieldType + field.options.global |  |
| render | s.tables.unstored_per_table | derived | derived from field.options.stored per table | Feeds the high_unstored_tables proliferation check. |
| render | s.tags.custom_count | gap | catalog-tags | Undercounts by every tag that exists only on a layout or a script. |
| render | s.tags.custom_tags | gap | catalog-tags | Same. |
| render | s.tags.internal_tags | gap | catalog-tags | Same. |
| render | s.tags.tagged_fields | covered | field.options.tags |  |
| render | s.tags.tagged_layouts | gap | catalog-tags | No layout tag list in fm. |
| render | s.tags.tagged_scripts | gap | catalog-tags | No script tag list in fm. |
| render | s.tags.tagged_tos | covered | tableOccurrence.tags | Describe by id; the listing has no tags. |
| render | s.tags.total_assignments | gap | catalog-tags | Sums tag counts across all four object kinds, two of which have no source. |
| render | s.tags.unique_count | gap | catalog-tags | Same. |
| render | s.theme | covered | `read:theme` describe `name` + `displayName` | Theme-style row: which theme a style belongs to. The style list is per theme, so the owning theme is whichever describe returned the key. |
| render | s.themes.detail | covered | `read:theme` list `items[]` + describe `{displayName,isCustom,namedStyleNames,colorPalette,layoutsUsing,layouts}` | The Themes tab's per-theme rows. |
| render | s.themes.theme_count | covered | `read:theme` list `items[]` total | Counts the themes defined in the file, not only the distinct themes layouts wear. |
| render | s.themes.themes_detail | covered | `read:theme` describe `colorPalette.swatch1..5` + `namedStyleNames` + `layoutsUsing` / `layouts` | Per-theme palette, style list and usage: `layoutsUsing` counts the layouts wearing the theme and `layouts` names them. Per-style colours and fonts still have to be parsed out of the `css` text. |
| render | s.unrefs.all_styles_detail | covered | `read:theme` describe `namedStyleNames` | Every style defined in the file, per theme. |
| render | s.unrefs.broken | covered | script.problems[] + <Field Missing> / <Table Missing> in calculation text | Confirmed in the samples: fm returns both the markers inside calculation text and its own live re-check per script. |
| render | s.unrefs.calc_deps | derived | derived from calculation text across catalogs + the table, field, script and layout name indexes |  |
| render | s.unrefs.confidence.reasons | gap | catalog-plugins | Four of the five uncertainty signals are derivable from calculation text (Evaluate, GetField, dynamic ExecuteSQL) and from read:externalDataSource; plugin_call_count is not, because nothing marks a call as a plugin call. |
| render | s.unrefs.confidence.tier | gap | catalog-plugins | The tier is computed from those five signals, so it degrades with the missing one. |
| render | s.unrefs.fields | derived | derived from read:field per table minus every reference site (layout objects, script step keys, calculation text, relation predicates, value lists) |  |
| render | s.unrefs.fields_tiered | derived | derived from the same reference sites, split by how the reference was found |  |
| render | s.unrefs.layouts | derived | derived from read:layout minus script.body[].layout + layout.contents.objects[].action.layout |  |
| render | s.unrefs.layouts_dynamic_warning | covered | script.body[].layout by calculation | fm names the by-calculation case as its own key instead of the legacy's id=0 sniff. |
| render | s.unrefs.scripts | derived | derived from read:script minus script.body[].script + layout object actions + layout.scriptTriggers[] + customMenu item actions |  |
| render | s.unrefs.table_occurrences | derived | derived from read:tableOccurrence minus relation.left/right + layout.tableOccurrence + field references |  |
| render | s.unrefs.tables | derived | derived from read:table minus tableOccurrence.table |  |
| render | s.unrefs.to_removability.completely_unused | derived | derived from tableOccurrence.related[] + layout.tableOccurrence + field references |  |
| render | s.unrefs.to_removability.relationship_only | derived | derived from tableOccurrence.related[] + layout.tableOccurrence + field references |  |
| render | s.unrefs.unused_styles | covered | `read:theme` describe `namedStyleNames` minus `layout.contents.objects[].style` | "Used" is derived: the style display names layout objects wear, subtracted from the theme's namedStyleNames. An object carrying local CSS and no style name is still invisible (catalog-object-styles), so the used set can undercount. |
| render | s.unrefs.unused_styles_detail | covered | `read:theme` describe `namedStyleNames` minus `layout.contents.objects[].style` | Same. |
| render | s.unrefs.value_lists | derived | derived from read:valueList minus layout.contents.objects[].valueList + field.options.validation.valueList |  |
| render | s.used | covered | derived from `layout.contents.objects[].style` against `read:theme` `namedStyleNames` | Theme-style row: whether a style is worn by any object. |
| render | s.valueLists.detail.all | covered | valueList.{name,type,values[],field} |  |
| render | s.valueLists.detail.dynamic_list | covered | valueList.type + valueList.field.{occurrence,field} |  |
| render | s.valueLists.detail.dynamic_related_only_list | covered | valueList.options.showRelatedOnly + valueList.startTable |  |
| render | s.valueLists.detail.static_list | covered | valueList.type + valueList.values[] |  |
| render | s.valueLists.value_list_count | derived | derived from read:valueList listing total |  |

## Summary

| Classification | Rows |
|---|---|
| covered | 414 |
| derived | 66 |
| gap | 75 |
| dropped | 8 |

Counted from this file on 2026-09-16 by tallying the Classification column of every table row; 414 + 66 + 75 + 8 = 563, the number of rows in the table. The rows themselves have not moved since 2026-09-14; what changed is that fm 0.7.0 turned 27 gap rows into covered rows - all 23 of `catalog-theme-styles`, the one `catalog-relation-sort` row, and three of the seven `catalog-layout-parts` rows - leaving 10 gap ids. A plain `grep -c` over the whole file returns one more than each number here, because the Summary row above also matches.

## Gap ids introduced

Ten ids, after fm 0.7.0 closed `catalog-theme-styles` and `catalog-relation-sort` outright and narrowed `catalog-layout-parts` (2026-09-16).

From the brief's list:

- `catalog-file-metadata` (24 rows): no catalog for File Options. Login mode, saved password, minimum FileMaker version, the three hide-sharing checkboxes, the startup layout and file-level script triggers have no read op and no Get() function (fm help: file-level options are deliberately not members of any catalog). Encryption state, file name, path, size, persistent ID and locale ARE readable through evaluate:calculation with Get() functions, so those rows are covered.
- `catalog-calculation-tokens` (4 rows): FileMaker's tokenised form of every calculation. A FileMaker 2026 SaXML export with DDR info carries each formula twice: as text and as FileMaker's own parse of it, a list of Chunk elements typed FieldReference, VariableReference, FunctionRef, CustomFunctionRef, ScriptRef and so on, which says exactly what a formula references. fm reports the text only; no read op and not validate:calculation exposes the tokens. Every cross-reference analysis (unreferenced fields and occurrences, broken references, global variables, custom function usage) therefore has to scan calculation text, which is approximate where FileMaker's parser is exact: variable names with spaces, references inside comments or string literals, `::` inside quoted text.
- `catalog-plugins` (7 rows): nothing marks a calculation call site as a plugin function call. The Plugins tab and the plugin-call uncertainty signal behind the Fields confidence tier depend on it.
- `catalog-modification-info` (14 rows): no object reports a modification count, and only a layout reports who and when (`layout.modified`). The Modification Hotspots tab and the audit columns of the Persistent Data tab depend on it.
- `catalog-layout-parts` (4 rows, narrowed on 2026-09-16): fm 0.7.0 reports `layout.parts[]{type,height,offset,name,breakField}`, which covers part presence, count, type, order and geometry, so the Wireframe tab and the header/footer/sub-summary/navigation layout lists have a source now. What is left is the part's options word (page breaks, page numbering, alternate and active row state), the raw part type code, the part definition kind, the object count per part, and any style or CSS a part wears - a part entry carries no style key at all.
- `catalog-object-styles` (4 rows): an object's local CSS override. `objects[].style` gives the named style's display name, but an object carrying CSS text and no style name - the exact local-override case the legacy counts - is invisible.

New in this pass:

- `catalog-tags` (8 rows): fm reports tags on fields, table occurrences, custom menus and custom menu sets, but not on layouts or scripts. The Tags tab's `tagged_layouts` and `tagged_scripts`, and their share of every tag total, have no source.
- `catalog-portal-setup` (4 rows): the portal's filter calculation, its stored sort order and its allow-create bit. The layout describe notes state outright that the sort and the filter are reported nowhere. `portals_with_filter`, `portals_with_sort` and `portals_allow_create` depend on them, and a field referenced only from a portal filter becomes a false positive in the unreferenced-fields report.
- `catalog-conditional-formatting` (3 rows): no layout object key reports conditional formatting at all. The broken-reference scan over conditional-format calculations, and any field referenced only from one, depend on it.
- `catalog-layout-menuset` (2 rows): which custom menu set a layout installs. `read:customMenuSet` lists the sets and `read:layout` describes the layout, but no key joins them.
