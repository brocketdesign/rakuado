$(document).ready(function(){
    handleKeywordsBehavior();
    handleSectionsBehavior();
    $('form#generator').on('submit',function(e){
        e.preventDefault()
        submitForm($(this));
    });

    const id = getQueryParam('id');
    var titleFromURL = getQueryParam('title');
    var descriptionFromURL = getQueryParam('description');
    var request1;
    if(id){
        request1 = $.get('/api/generator/data?id='+id,function(data){
            if (data) {
                console.log(data)
                if (titleFromURL) {
                    $('#title').val(decodeURIComponent((titleFromURL).trim()));
                    $('.current-title').text(decodeURIComponent((titleFromURL).trim()));
                }else{
                    $('#title').val(data.completion[0])
                    //$('#title').val(data.request.TITLE)
                    //$('.current-title').text(data.request.TITLE);
                }

                if(descriptionFromURL){
                    $('#description').val(decodeURIComponent((descriptionFromURL).trim()));
                    $('.current-description').text(decodeURIComponent((descriptionFromURL).trim()));
                }else{
                    $('#description').val(data.request.DESCRIPTION)
                    $('.current-description').text(data.request.DESCRIPTION);
                }

                $('#sections').val(data.completion).attr('data-sections',data.completion);

                $('#writingStyle').val(data.request.WRITING_STYLE)
                $('#language').val(data.request.LANGUAGE)
                $('#writingTone').val(data.request.WRITING_TONE)
                
                if($('#list-titles').length > 0){
                    //listTitles(data)
                }
                if($('#sections').length > 0){
                    sectionUpdate();
                }
               
            }
        })
    }

    var request2;
    const articleId = getQueryParam('articleId');

    if(articleId){
       request2 = $.get('/api/rss/articles/'+articleId,function(data){
            $('#title').val(data.title);
            $('#metaDescription').val(data.metaDescription);
        });
    }
    //hideForm(); // Assuming hideForm is a function you want to call regardless

    // Captain (you) making the call
    $.when(request1, request2).done(function () {
        // Both AJAX calls have returned, check the form type before proceeding
        if ($('form#generator').data('type') !== 3) {
            //$('form#generator').submit();
        } else {
            // Maybe the form needs a last-minute check or you need to show a message
            console.log("Arrr, we're not ready to set sail yet!");
        }
    });
});
function hideForm(){
    $('form#generator .card-header').hide()
    $('form#generator .form-group').hide()
    $('form#generator .card').css({
        "background": "transparent",
        "box-shadow": "none"
    })
    $('#generation').css({
        "position": "absolute",
        "top": "0",
        "right":"0",
        "left":"0"
      })
    $('form#generator .form-group button#generation').parent().show()
}
// Function to grab query params from the URL
function getQueryParam(param) {
    var queryParams = new URLSearchParams(window.location.search);
        return queryParams.get(param);
}

function submitForm(formSelector) {
    if(formSelector.hasClass('busy')){
        return;
    }

    let type = formSelector.data('type');

    // Safely parse the type if it's a string that could be an array
    if (typeof type === 'string' && type.startsWith('[') && type.endsWith(']')) {
        try {
            type = JSON.parse(type);
        } catch (e) {
            console.error('Failed to parse type as JSON', e);
            return;
        }
    }

    if (Array.isArray(type)) {
        type.forEach((t) => sendForm(formSelector, t));
    } else {
        sendForm(formSelector, type);
    }
}

 function sendForm(formSelector,type){
        formSelector.addClass('busy');
        $(`button#generation .text`).text('Loading ...');
    
        var keywords = [];
        $('.keyword-badge').each(function() {
            keywords.push($(this).data('keyword'));
        });
        var sections = [];
        $('.section-badge').each(function() {
            sections.push($(this).data('section'));
        });

        if (sections.length === 0) {
            sections = [''];
        }
    
        let sectionsSubject = $('#sectionsSubject').val() || '';
        sectionsSubject = sectionsSubject.trim().split(',').filter(title => title.length);
        if (sectionsSubject.length === 0) {
            sectionsSubject = [''];
        }
        const count = $('#count').val() || 1 
        for (let i = 0; i<count; i++) {
            console.log({count,i})
            var data = {
                KEYWORDS:keywords,
                SECTION_SUBJECT:sectionsSubject,
                SECTIONS_COUNT : $('#sectionsCount').val(),
                METADESCRIPTION_COUNT : $('#metaDescriptionCount').val(),
                METADESCRIPTION : $('#metaDescription').val(),
                TITLE : $('#title').val(),
                DESCRIPTION: $('#description').val(),
                CONTENT : $('#articleContent').val(),
                WRITING_STYLE : $('#writingStyle').val(),
                LANGUAGE : $('#language').val(),
                WRITING_TONE : $('#writingTone').val(),
                INDEX:i
            };
            console.log(data)
            
            handleFormSubmit(type,data);
        }
    }
   
function handleFormSubmit(type, data) {

    //$('#result').html('')
    generateStream(type, data, handleStreamSuccess(type, data), handleStreamError(), handleStreamFinally());
    if($('#seoSearch').length>0){
        seoSearch(data)
    }
}

function handleStreamSuccess(type, data) {
    return function(response) {
        handleStream(response, appendMessageToContainer(type, data, response), handleStreamEnd(type, data,response));
    };
}

function appendMessageToContainer(type, data, response) {
    return function(message) {
        const containerID = `response-${type}-${response.insertedId}-${data.INDEX}`;
        if ($(`#${containerID}`).length == 0) {
            const initialCardHtml = `
                <div class="card mb-3">
                    <div class="card-body">
                        <div id=${containerID}></div>
                        <div class="row">
                            <div data-id=${containerID} class="action-button"></div>
                        </div>                   
                    </div>
                </div>`;
            $('#result').prepend(initialCardHtml);
        }
        $(`#${containerID}`).append(message);
    };
}

function handleStreamEnd(type, data,response) {
    return function(stream_data) {
        const completionId = stream_data.id
        const containerID = `response-${type}-${response.insertedId}-${data.INDEX}`;
        convertResponse(`#${containerID}`,stream_data);
        udpateSendButton(containerID,completionId)
    };
}

function handleStreamError() {
    return function() {
        updateUIAfterStream();
    };
}

function handleStreamFinally() {
    return function() {
        updateUIAfterStream();
    };
}

function updateUIAfterStream() {
    $(`form#generator`).removeClass('busy');
    $(`#generation .text`).text('新しく生成する');
}

function udpateSendButton(containerID,completionId){
    const type = parseInt($('form#generator').data('type'))
    const next_type = type + 1
    if( type == 1 || type == 7 || type == 8){ return }
    if($(`.send-${completionId}`).length == 0){
        $(`#result .action-button[data-id="${containerID}"]`)
        .append(`<a class="col-12 btn btn-primary send-${completionId}" href="/dashboard/app/generator/8?id=${completionId}" target="_blank">USE THIS CONTENT</a>`)
    }
}
function listTitles(stream_data){
    var list = $('<ul>', {
        'class': 'list-group', 
        'id':`list-${stream_data._id}`
    });
    $('#list-titles').html(list);
    
    $.each(stream_data.completion[0], function(index, title) {
        console.log(title)
        var listItem = $('<li>', {
            'class': 'list-group-item', 
        });
        
        var hyperlink = $('<a>',{
            'href':`/dashboard/app/generator/8?id=${stream_data._id}&title=${title}`,
            text: title.replace(/"/g, '').trim(),
            target:'_blank'
        })

        $(document).find(`#list-${stream_data._id}`).append(listItem.append(hyperlink))

    });
}
function convertResponse(sourceSelector,stream_data) {
    const type = parseInt($('form#generator').data('type'))
    if(type == 1 ){
        var list = $('<ul>', {
            'class': 'list-group', 
            'id':`list-${stream_data.id}`
        });
        $(sourceSelector).html(list);

        $.each(stream_data.completion, function(index, title) {
            var listItem = $('<li>', {
                'class': 'list-group-item', 
            });
            
            var hyperlink = $('<a>',{
                'href':`/dashboard/app/generator/8?id=${stream_data.id}&title=${title}`,
                text: title.replace(/"/g, '').trim(),
                target:'_blank'
            })
    
            $(document).find(`#list-${stream_data.id}`).append(listItem.append(hyperlink))

        });
        return
    }
    if(type == 7){
        var list = $('<ul>', {
            'class': 'list-group', 
            'id':`list-${stream_data.id}`
        });
        $(sourceSelector).html(list);

        $.each(JSON.parse(stream_data.completion), function(index, description) {
            var listItem = $('<li>', {
                'class': 'list-group-item', 
            });
            
            var hyperlink = $('<a>',{
                'href':`/dashboard/app/generator/2?id=${stream_data.id}&description=${description}&title=${$('#title').val()}`,
                text: description,
                target:'_blank'
            })
    
            $(document).find(`#list-${stream_data.id}`).append(listItem.append(hyperlink))

        });
        return
    }
    // Use showdown library to convert markdown to HTML
    const converter = new showdown.Converter();
    
    function convertMarkdownToHTML(markdownContent) {
        return converter.makeHtml(markdownContent);
    }

    
    let markdownContent = $(sourceSelector).text();
    let htmlContent = convertMarkdownToHTML(markdownContent);
    $(sourceSelector).html(htmlContent);
}

function generateStream(type, data, callback, errorcallback, finallyCallback) {
    // Simulate request
    $.ajax({
        url: '/api/generator/generate/' + type, // Replace with your endpoint
        method: 'POST',
        data: data,
        success: function(response) {
            callback(response);
        },
        error: function(jqXHR, textStatus, errorThrown) {
            console.error('Error: ', errorThrown);
            errorcallback(jqXHR, textStatus, errorThrown); // Pass error details to the callback
        }
    }).always(function() {
        finallyCallback(); // This will execute after success or error
    });
}

function seoSearch(data,callback,errorcallback,finallyCallback){
    $.ajax({
        url: '/api/generator/seoSearch/', // Replace with your endpoint
        method: 'POST',
        data,
        success: function(response) {
            if (callback) {callback(response)}
            createListSearch(response);
        },
        error: function(jqXHR, textStatus, errorThrown) {
            console.error('Error: ', errorThrown);
            if(errorcallback){errorcallback(jqXHR, textStatus, errorThrown);}
             // Pass error details to the callback
        }
    }).always(function() {
        if(finallyCallback){finallyCallback();}
    });
}

function handleStream(response,callback,endCallback) {

    // Establish an EventSource connection for live streaming
    const source = new EventSource(response.redirect);

    source.onopen = function(event) {
        //console.log("EventSource connection opened:", event);
    };

    source.onmessage = function(event) {
        //console.log("Raw data received:", event.data);
        
        try {
            // Assuming data contains a 'message' field. Modify as needed.
            const message = JSON.parse(event.data).content;    
            // Update the content of the card with the insertedId
            callback(message)

        } catch (e) {
            console.error("Error parsing received data:", e);
        }
    };

    source.addEventListener('end', function(event) {

        const data = JSON.parse(event.data);

        if (endCallback) endCallback(data);

        source.close();

    });

    source.onerror = function(error) {
        console.error("EventSource failed:", error);
        if (endCallback) endCallback(data);
        source.close();
    };

    return source;
}

// Keyword Behavior

function handleKeywordsBehavior(){
    if($('#keywords').length == 0){
        return
    }
    $('#keywords').on('keydown', function(e) {
        // When Enter key is pressed, comma, or Japanese comma is entered
        if (e.key === 'Enter' || e.key === ',' || e.key === '、') {
            e.preventDefault(); // Stop the press! No default behavior allowed here.
            keywordUpdate();
        }
    });
    
    

    // Functionality to remove a tag when the remove button is clicked
    $(document).on('click', '.remove-tag', function() {
        $(this).parent('.keyword-badge').remove();
        updateInput()
    });
}
function keywordUpdate(){
    var inputValue = $('#keywords').val().trim(); // Trim the input like it's a bonsai tree.
    if (inputValue) { // If there's some juicy input...
        // Split the input into an array of keywords, catering to both English and Japanese commas
        var keywords = inputValue.split(/,|、| |　/).map(function(keyword) {
            return keyword.trim(); // Trim each keyword with the precision of a sushi chef.
        }).filter(function(keyword) {
            return keyword !== ""; // We only want the meaty keywords, no empty shells.
        });

        // For each keyword, whether it's from Tokyo or Texas, let's give it a tag!
        keywords.forEach(function(keyword) {
            var html = '<span class="col btn keyword-badge shadow-0 position-relative m-0 border border-dark rounded-0" data-keyword="' + keyword + '">' + keyword +
                       '<i type="button" class="remove-tag fa fa-times position-absolute" style="top:3px;right:5px;"></i></span>';
            $('#keywords').before(html); // Place our newly minted tags like jewels before the crown.
        });

        $('#keywords').val(''); // Clear the stage, our input's job here is done.
    }
    // Update the input required status
    updateInput();
}
function updateInput(){
    const keywords = $('.keyword-badge').length
    if(keywords>0){
        $('#keywords').attr('required',false)
        return
    }
    $('#keywords').attr('required',true)
}

// Section Behavior
function handleSectionsBehavior(){
    if($('#sections').length == 0){
        return
    }
    $('#sections').on('keydown', function(e) {
        // When Enter key is pressed, comma, or Japanese comma is entered
        if (e.key === 'Enter' || e.key === ',' || e.key === '、') {
            e.preventDefault(); // Stop the press! No default behavior allowed here.
            sectionUpdate();
        }
    });
    
    

    // Functionality to remove a tag when the remove button is clicked
    $(document).on('click', '.remove-tag', function() {
        $(this).parent('.section-badge').remove();
        sectionUpdate()
    });
}
function sectionUpdate(){
    var inputValue = $('#sections').val().trim(); // Trim the input like it's a bonsai tree.
    if (inputValue) { // If there's some juicy input...
        // Split the input into an array of sections, catering to both English and Japanese commas
        var sections = inputValue.split(/,|、/).map(function(section) {
            return section.trim(); // Trim each section with the precision of a sushi chef.
        }).filter(function(section) {
            return section !== ""; // We only want the meaty sections, no empty shells.
        });

        // For each section, whether it's from Tokyo or Texas, let's give it a tag!
        sections.forEach(function(section) {
            var html = '<span class="col btn section-badge shadow-0 position-relative m-0 border border-dark rounded-0 text-start" data-section="' + section + '">' + section +
                       '<i type="button" class="remove-tag fa fa-times position-absolute" style="top:3px;right:5px;"></i></span>';
            $('#sections').before(html); // Place our newly minted tags like jewels before the crown.
            $('.current-sections').append(`<li class="list-group-item border-0 fs-5 fw-bold">${section}</li>`)
        });

        $('#sections').val(''); // Clear the stage, our input's job here is done.
    }
    // Update the input required status
    updateSectionInput();
}
function updateSectionInput(){
    const sections = $('.section-badge').length
    if(sections>0){
        $('#sections').attr('required',false)
        return
    }
    $('#sections').attr('required',true)
}
function createListSearch(response){
    console.log(response)
    $.each(response.data, function(index, item) {
        // Create a list item for each title
        var listItem = $('<li>', {
            'class': 'list-group-item', 
        });
        var hyperlink = $('<a>',{
            'href':item.link,
            text: item.title,
            target:'_blank'
        })

        listItem.append(hyperlink)
        $('#seoSearch').append(listItem);
    })
}