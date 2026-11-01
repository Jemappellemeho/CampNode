path = r'd:\CampNode\CampNode\client\src\pages\CourseManager.tsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Normalize to LF for matching
c = content.replace('\r\n', '\n')

# Find the card: starts at "              {course.topics?.map((topic: any, i: number) => (\n                <div \n                  key={topic.id} draggable"
# ends at the matching "))]}" 

map_start = '              {course.topics?.map((topic: any, i: number) => (\n'
card_start_marker = '                <div \n                  key={topic.id} draggable\n'
map_end = '              ))}\n'

idx_map = c.find(map_start)
print(f"map start: {idx_map}")
if idx_map < 0:
    print("ERROR: can't find map start")
    exit(1)

# Find the card start (right after map_start)
idx_card = idx_map + len(map_start)
expected = c[idx_card:idx_card+len(card_start_marker)]
print(f"Card starts with expected marker: {expected == card_start_marker}")

# Find the map end after the card
idx_map_end = c.find(map_end, idx_card)
print(f"map end: {idx_map_end}")

# The card content is between map_start and map_end  
# The full block to replace: from map_start to map_end + len(map_end)
old_block = c[idx_map:idx_map_end + len(map_end)]

# New block: uses TopicCard component
new_block = '              {course.topics?.map((topic: any, i: number) => (\n                <TopicCard key={topic.id} topic={topic} i={i} course={course} editingNameId={editingNameId} editingNameValue={editingNameValue} setEditingNameValue={setEditingNameValue} setEditingNameId={setEditingNameId} saveName={saveName} startEditingName={startEditingName} deleteTopic={deleteTopic} expandedMainTopics={expandedMainTopics} setExpandedMainTopics={setExpandedMainTopics} expandedTopics={expandedTopics} setExpandedTopics={setExpandedTopics} editingSubId={editingSubId} setEditingSubId={setEditingSubId} linkData={linkData} setLinkData={setLinkData} prereqSelection={prereqSelection} setPrereqSelection={setPrereqSelection} addingSubTo={addingSubTo} setAddingSubTo={setAddingSubTo} newSubForm={newSubForm} setNewSubForm={setNewSubForm} newSubWikiQuery={newSubWikiQuery} newSubWikiResults={newSubWikiResults} suggestLoadingTopic={suggestLoadingTopic} suggestionsByTopic={suggestionsByTopic} suggestErrorTopic={suggestErrorTopic} handleTopicDrop={handleTopicDrop} handleSubtopicDrop={handleSubtopicDrop} handleReplacementFile={handleReplacementFile} saveTopicSettings={saveTopicSettings} saveLinks={saveLinks} clearAttachedPdf={clearAttachedPdf} renderQuizOverview={renderQuizOverview} renderResourceOverview={renderResourceOverview} getContentPreviewMeta={getContentPreviewMeta} openQuizEditor={openQuizEditor} generateQuizDraft={generateQuizDraft} loadSubtopicSuggestions={loadSubtopicSuggestions} acceptSuggestion={acceptSuggestion} addSubtopic={addSubtopic} searchWiki={searchWiki} selectWikiResult={selectWikiResult} setNewSubWikiQuery={setNewSubWikiQuery} setNewSubWikiResults={setNewSubWikiResults} />\n              ))}\n'

c = c.replace(old_block, new_block)

# Add import for TopicCard after SubtopicSettingsPanel import
c = c.replace(
    "import SubtopicSettingsPanel from './courseManager/SubtopicSettingsPanel';",
    "import SubtopicSettingsPanel from './courseManager/SubtopicSettingsPanel';\nimport TopicCard from './courseManager/TopicCard';"
)

# Write back with CRLF
c_out = c.replace('\n', '\r\n')
with open(path, 'w', encoding='utf-8') as f:
    f.write(c_out)

line_count = c_out.count('\r\n') + 1
print(f"Done. New line count: {line_count}")
