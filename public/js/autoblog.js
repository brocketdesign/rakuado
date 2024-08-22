$(document).ready(function() {

    $('#botForm').on('submit', function(event) {
        event.preventDefault(); // Prevent the form from submitting via the browser
        var formData = $(this).serialize(); // Serialize the form data

        // You can add validation or manipulation of formData here

        $.ajax({
            type: 'POST',
            url: '/api/autoblog/bot-info',
            data: formData,
            success: function(response) {
                // Handle success
                Swal.fire({
                    icon: 'success',
                    title: '送信完了',
                    text: 'フォームが正常に送信されました。',
                    confirmButtonText: '閉じる'
                });
            },
            error: function() {
                // Handle error
                Swal.fire({
                    icon: 'error',
                    title: 'エラー発生',
                    text: 'エラーが発生しました。再試行してください。',
                    confirmButtonText: '閉じる'
                });
            }
        });
    });

    // Function to add new blog URL input
    $('body').on('click', '.add-blog-url', function() {
        var newInputGroup = $(this).closest('.input-group').clone();
        newInputGroup.find('input').val('');
        newInputGroup.find('.remove-blog-url').attr('disabled', false);
        $('#blogUrls').append(newInputGroup);
    });

    // Function to remove blog URL input
    $('body').on('click', '.remove-blog-url', function() {
        if ($('#blogUrls .input-group').length > 1) {  // Prevent removing the last input group
            $(this).closest('.input-group').remove();
        } else {
            $(this).closest('.input-group').find('input').val('');  // Clear the input if it's the last remaining group
            $(this).attr('disabled', 'disabled');
        }
    });

    // Initial state should not allow removal of the only input field
    $('.remove-blog-url').attr('disabled', 'disabled');

    $('#autoBlogForm').on('submit', function(event) {
        event.preventDefault(); // Prevent the form from submitting via the browser
        var formData = $(this).serialize(); // Serialize the form data

        // You can add validation or manipulation of formData here

        $.ajax({
            type: 'POST',
            url: '/api/autoblog/blog-info',
            data: formData,
            success: function(response) {
                // Handle success
                Swal.fire({
                    icon: 'success',
                    title: '送信完了',
                    text: 'フォームが正常に送信されました。',
                    confirmButtonText: '閉じる'
                }).then((result) => {
                    if (result.isConfirmed) {
                        location.reload();
                    }
                });                
                
            },
            error: function() {
                // Handle error
                Swal.fire({
                    icon: 'error',
                    title: 'エラー発生',
                    text: 'エラーが発生しました。再試行してください。',
                    confirmButtonText: '閉じる'
                });
            }
        });
    });     

    var blogId = $('#blogId').data('id'); // Assume #blogId is your input field for the blog ID
    if(blogId) {
        $.ajax({
            url: '/api/autoblog/blog-info/' + blogId,
            type: 'GET',
            success: function(data) {
                Object.keys(data).forEach(function(key) {
                    // Check if an input field with an ID matching the key exists
                    var $input = $('#' + key);
                    if ($input.length) {
                        // Populate the input field with the value from the corresponding key in blogInfo
                        $input.val(data[key]);
                    }
                });

                if (data && data.additionalUrls && data.additionalUrls.length > 0) {
                    // Load each URL into its own input group
                    data.additionalUrls.forEach(function(url) {
                        var inputGroup = $('.template').clone().removeClass('template').show();
                        inputGroup.find('input').val(url);
                        $('#blogUrls').append(inputGroup);
                    });
                } else {
                    // Initialize with one empty input group if no URLs exist
                    var inputGroup = $('.template').clone().removeClass('template').show();
                    $('#blogUrls').append(inputGroup);
                }
                // Always ensure the remove button is functional unless there's only one input group
                if ($('#blogUrls .input-group').length > 1) {
                    $('.remove-blog-url').attr('disabled', false);
                }

                validateAndToggleIcon();
            },
            error: function(xhr, status, error) {
                // Handle errors
                console.error("Failed to fetch blog info:", error);
            }
        });

        updateCategoryList(blogId)

    }else {
        // Even if there's no blogId, initialize with one empty input group
        var inputGroup = $('.template').clone().removeClass('template').show();
        $('#blogUrls').append(inputGroup);
    }
    var botId = $('#botId').data('id');
    if(botId){
        $.ajax({
            url: '/api/autoblog/bot-info/' + botId,
            type: 'GET',
            success: function(botInfo) {

                Object.keys(botInfo).forEach(function(key) {
                    // Check if an input field with an ID matching the key exists
                    var $input = $('#' + key);
                    if ($input.length) {
                        // Populate the input field with the value from the corresponding key in blogInfo
                        $input.val(botInfo[key]);
                    }
                });
            },
            error: function(xhr, status, error) {
                // Handle errors
                console.error("Failed to fetch blog info:", error);
            }
        });
    }
    deleteButton();
    duplicateButton();
});

function duplicateButton() {
    $('.duplicate-bot-btn').off('click').on('click', function() {
        var botId = $(this).attr('data-id'); // Get the blogId from the button's data-id attribute

        $.ajax({
            url: '/api/autoblog/duplicate-bot/' + botId, // Adjust this URL as needed
            type: 'POST',
            success: function(response) {
                // Assuming the response contains the newBlogId
                var newBotId = response.newBotId;
                // Redirect to the new blog's info page
                window.location.href = '/dashboard/app/autoblog/bot?botId=' + newBotId;
            },
            error: function(xhr, status, error) {
                // Handle errors (e.g., display an error message)
                alert("Failed to duplicate blog info: " + error);
            }
        });
    });
}

// Call the function when the document is ready
$(document).ready(function() {
    duplicateButton();
});

function deleteButton() {
    $('.delete-bot-btn').on('click', function() {
        var botId = $(this).data('id'); // Assuming the button's id attribute contains the blogId

        Swal.fire({
            title: '本当に削除しますか？',
            text: "この操作は元に戻せません！",
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#3085d6',
            cancelButtonColor: '#d33',
            confirmButtonText: 'はい、削除します！',
            cancelButtonText: 'キャンセル',
            reverseButtons: true
        }).then((result) => {
            if (result.isConfirmed) {
                $.ajax({
                    url: '/api/autoblog/bot/' + botId,
                    type: 'DELETE',
                    success: function(response) {
                        Swal.fire(
                            '削除されました！',
                            'ブログ情報が正常に削除されました。',
                            'success'
                        );
                        $(`.card[data-id="${botId}"]`).fadeOut();
                    },
                    error: function(xhr, status, error) {
                        Swal.fire({
                            icon: 'error',
                            title: '削除できませんでした',
                            text: "ブログ情報の削除に失敗しました: " + error
                        });
                    }
                });
            }
        });
    });
    $('.delete-blog-btn').on('click', function() {
        var blogId = $(this).data('id'); // Assuming the button's id attribute contains the blogId

        Swal.fire({
            title: '本当に削除しますか？',
            text: "この操作は元に戻せません！",
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#3085d6',
            cancelButtonColor: '#d33',
            confirmButtonText: 'はい、削除します！',
            cancelButtonText: 'キャンセル',
            reverseButtons: true
        }).then((result) => {
            if (result.isConfirmed) {
                $.ajax({
                    url: '/api/autoblog/blog/' + blogId,
                    type: 'DELETE',
                    success: function(response) {
                        Swal.fire(
                            '削除されました！',
                            'ブログ情報が正常に削除されました。',
                            'success'
                        );
                        window.location.href = '/dashboard/app/autoblog/'
                    },
                    error: function(xhr, status, error) {
                        Swal.fire({
                            icon: 'error',
                            title: '削除できませんでした',
                            text: "ブログ情報の削除に失敗しました: " + error
                        });
                    }
                });
            }
        });
    });
}


function toggleBlogStatus(blogId, newState) {
    fetch(`/api/autoblog/bot/ `, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ blogId: blogId, isActive: newState }),
    })
    .then(response => response.json())
    .then(data => {
        // Handle response
        console.log(data);
        window.location.reload(); // Reload the page to see the updated state
    })
    .catch((error) => {
        console.error('Error:', error);
    });
}
function toggleBotStatus(botId, newState) {
    fetch(`/api/autoblog/bot-info/ `, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ botId: botId, isActive: newState }),
    })
    .then(response => response.json())
    .then(data => {
        // Handle response
        console.log(data);
        $(`.toggle-bot-btn[data-id="${botId}"]`).each(function() {
            $(this).toggleClass('d-none');
        });        
    })
    .catch((error) => {
        console.error('Error:', error);
    });
}
function toggleBlogStatus(blogId, newState) {
    fetch(`/api/autoblog/blog-info/ `, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ blogId, isActive: newState }),
    })
    .then(response => response.json())
    .then(data => {
        // Handle response
        console.log(data);
        $(`.toggle-blog-btn[data-id="${blogId}"]`).each(function() {
            $(this).toggleClass('d-none');
        });        
    })
    .catch((error) => {
        console.error('Error:', error);
    });
}

function updateCategoryList(blogId) {
    if($('#postCategory').length == 0){
        return
    }
    $.ajax({
        url: '/api/autoblog/info/category/' + blogId,
        type: 'GET',
        success: function(categories) {

            for(let category of categories){
                $('#postCategory').append(`
                    <option value=${category.termId}>${category.name}</option>
                `)
            }
        },
        error: function(xhr, status, error) {
            // Handle errors
            console.error("Failed to fetch blog info:", error);
        }
    });
}
function postBlogArticle(blogId) {
    Swal.fire({
      title: '処理を開始しますか？',
      text: 'ブログ記事の投稿を開始します。',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#3085d6',
      cancelButtonColor: '#d33',
      confirmButtonText: 'はい',
      cancelButtonText: 'いいえ'
    }).then((result) => {
      if (result.isConfirmed) {
        $.ajax({
          url: '/api/autoblog/post-blog-article',
          type: 'POST',
          data: JSON.stringify({ blogId: blogId }),
          contentType: 'application/json; charset=utf-8',
          dataType: 'json',
          success: function(response) {
            Swal.fire(
              '完了しました！',
              '記事の処理が正常に開始されました。',
              'success'
            );
          },
          error: function(xhr, status, error) {
            Swal.fire(
              'エラーが発生しました',
              '処理を開始できませんでした。詳細: ' + xhr.responseText,
              'error'
            );
          }
        });
      }
    });
  }
  
  function validateAndToggleIcon() {
    const urlInput = $('#blogUrl');
    if(urlInput.length == 0) return
    const iconSpan = $('#openNewPageIcon');
    const url = urlInput.val().trim();
    // Simple check for a basic URL pattern
    if (url.length > 0) {
        iconSpan.show();
        iconSpan.find('a').attr('href', url);
    } else {
        iconSpan.hide();
    }
}

