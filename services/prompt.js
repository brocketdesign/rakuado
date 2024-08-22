function generatePrompt(data, type) {
    let result = { prompt: '', max_tokens: 0 };
    switch (type) {
        case '4':
            // Setting up for tweet generation
            const { SECTION, COUNT, TITLE, WRITING_STYLE, LANGUAGE, WRITING_TONE } = data;
            result.prompt = `Write ${COUNT} tweets in ${LANGUAGE} with a ${WRITING_STYLE} style. It is to promote a blog post titled "${TITLE}" and the topic I want to focus on is ${SECTION}. The tweets should be composed in a ${WRITING_TONE} tone.`;
            result.max_tokens = 50; // Assuming max length of a tweet
            break;
        case '0':
            // Setting up for title generation
            const { TITLE:feedTitle,THEME:feedTheme ,METADESCRIPTION:feedDescription, LANGUAGE : feedLanguage,WRITING_STYLE: feedStyle, WRITING_TONE : feedTone } = data;
            result.prompt = `Provide a SEO title in ${feedLanguage} about : ["${feedTitle}"] tailored to a ${feedLanguage}-speaking audience.${feedTheme ?`The main theme is ${feedTheme}`:'' }. The tone should be ${feedTone}, aligning with the article's ${feedStyle} style. You MUST respond in ${feedLanguage} .`;
            result.max_tokens = 100 ; // Titles are usually short and sweet
            break;
        case '1':
            // Setting up for title generation
            const { KEYWORDS,COUNT:titleCount, LANGUAGE : titleLanguage,WRITING_STYLE: titleStyle, WRITING_TONE : titleTone } = data;
            result.prompt = `Generate ${titleCount} creative and SEO-friendly ${titleCount>1?'titles':'title'} in ${titleLanguage} for a blog post related to the following keywords: ${KEYWORDS}. Style: ${titleStyle}. Use a ${titleTone} tone.Return a javascript array.`;
            result.max_tokens = 100 * titleCount; // Titles are usually short and sweet
            break;
        case '2':
            // Setting up for section heading generation
            const { SECTIONS_COUNT,SECTION_SUBJECT, TITLE:sectionTitle, DESCRIPTION, WRITING_STYLE: sectionStyle, LANGUAGE: sectionLanguage, WRITING_TONE: sectionTone } = data;
            result.prompt = `Write ${SECTIONS_COUNT} headings for a blog post titled "${sectionTitle}" about ${DESCRIPTION} in ${sectionLanguage}.${SECTION_SUBJECT[0].length>0?`The heading subjects are : ${SECTION_SUBJECT}`:''} Style: ${sectionStyle}. Tone: ${sectionTone}. Each heading is between 40 and 60 characters. Use Markdown for the headings (### ).`;
            result.max_tokens = 500 * SECTIONS_COUNT; // Approximation for section headings
            break;
        case '3':
            // Setting up for article paragraph generation
            const { SECTION: articleSection, TITLE: articleTitle, WRITING_STYLE: articleStyle, LANGUAGE: articleLanguage, WRITING_TONE: articleTone } = data;
            result.prompt = `Write an extensive blog post about "${articleSection}" for an article titled "${articleTitle}" in ${articleLanguage}. Try to make shorter sentences, using less difficult words to improve readability. Add a heading at each paragraph beginning. Use Markdown for formatting. Style: ${articleStyle}. Tone: ${articleTone}.`;
            result.max_tokens = 1500; // A decent length for a paragraph
            break;
        case '5':
            // Setting up for article title generation based on content
            const { TITLE: generateArticleTitle, CONTENT: generateArticleContent, WRITING_STYLE: generateArticleStyle, LANGUAGE: generateArticleLanguage, WRITING_TONE: generateArticleTone } = data;
            result.prompt = `Given the article content and its style, generate a compelling title that captures its essence while adhering to the specified writing style and tone. 
            
            Content: "${generateArticleContent}"
            
            Style: ${generateArticleStyle}
            Tone: ${generateArticleTone}
            Language: ${generateArticleLanguage}
            
            New Title in ${generateArticleLanguage}:`;
            result.max_tokens = 60; // A title doesn't need too many tokens.
            break;
        
        case '6':
            // Setting up for article summary generation
            const { CONTENT: GenerateArticleContent, WRITING_STYLE: GenerateArticleStyle, LANGUAGE: GenerateArticleLanguage, WRITING_TONE: GenerateArticleTone } = data;
            result.prompt = `Summarize the following article content into a concise summary that retains the key points and messages, reflecting the specified writing style, tone, and language.
            
            Content: "${GenerateArticleContent}"
            
            Style: ${GenerateArticleStyle}
            Tone: ${GenerateArticleTone}
            Language: ${GenerateArticleLanguage}
            
            Summary in ${GenerateArticleLanguage}:`;
            result.max_tokens = 500; // Adjust based on desired summary length, 150 tokens should provide a decent summary.
            break;
        case '7':
            // Setting up for article paragraph generation
            const { METADESCRIPTION_COUNT, TITLE: metaTitle, WRITING_STYLE: metaStyle, LANGUAGE: metaLanguage, WRITING_TONE: metaTone } = data;
            result.prompt = `Write ${METADESCRIPTION_COUNT} appealing and creative introduction for an article about "${metaTitle}" in ${metaLanguage}. Try to make shorter sentences, using less difficult words to improve readability. Style: ${metaStyle}. Tone: ${metaTone}. Return a javascript array.`;
            result.max_tokens = 600 * METADESCRIPTION_COUNT; // A decent length for a paragraph
            break;
        case '8':
            // Setting up for article paragraph generation
            const { TITLE: finalTitle,THEME:finalTheme, WRITING_STYLE: finalStyle, LANGUAGE: finalLanguage, WRITING_TONE: finalTone } = data;
            result.prompt = `Write a blog post about "${finalTitle}" in ${finalLanguage}.${finalTheme ?`The main theme is ${finalTheme}`:'' }Provide a well structured and readable article. Style: ${finalStyle}. Tone: ${finalTone}. Use Markdown. you MUST respond in ${finalLanguage}`;
            result.max_tokens = 1000 ; // A decent length for a paragraph
            break;
            
            
    }
    return result;
}

module.exports = { generatePrompt };
