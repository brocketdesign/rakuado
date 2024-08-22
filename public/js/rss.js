
  $(document).ready(function(){
    manageFeeds();
  })
  function manageFeeds(){
    addFeeds();
    listFeeds();
    updateFeeds();
    deleteFeeds();
    statusFeed();
    //Articles
    initiFeedArticles();
    viewArticle();
  }
  function addFeeds(){
    $('#addRssForm').submit(function(event) {
        event.preventDefault(); // Prevent the form from submitting the traditional way
        const url = $('#rssUrl').val();
        const name = $('#rssName').val();
      
        $.ajax({
          type: 'POST',
          url: '/api/rss/feeds',
          data: JSON.stringify({ url, name }),
          contentType: 'application/json',
          success: function(response) {
            // Assuming you want to do something like adding the new feed to the list without reloading
            alert('Feed added successfully');
            $('#feedsList').append(`<li class="list-group-item d-flex justify-content-between flex-column">
                <a href="/dashboard/app/feed?feedId=${response.id}">  ${name} </a>
                <div class="btn-group" role="group">
                <button class="btn btn-secondary update-feed" data-id="${response.id}">Update</button>

                <button class="btn btn-success change-status " data-id="${response.id}" data-status="active">Start</button>
                <button class="btn btn-warning change-status d-none" data-id="${response.id}" data-status="paused">Pause</button>

                <button class="btn btn-danger delete-feed" data-id="${response.id}">Delete</button>
                </div>
            </li>`);
                // Clear the form fields
            $('#rssUrl').val('');
            $('#rssName').val('');
          },
          error: function(xhr, status, error) {
            alert(`Error adding feed: ${xhr.responseText}`);
          }
        });
      });
  }
  function listFeeds() {
    $.ajax({
      type: 'GET',
      url: '/api/rss/feeds',
      success: function(feeds) {
        $('#feedsList').empty(); // Clear the list first
        feeds.forEach(feed => {
          $('#feedsList').append(`<li class="list-group-item d-flex justify-content-between flex-column">
          <a href="/dashboard/app/feed?feedId=${feed._id}">  ${feed.name} </a>
            <div class="btn-group" role="group">
              <button class="btn btn-secondary update-feed" data-id="${feed._id}">Update</button>

              <button class="btn btn-success change-status ${feed.status=='active'?'d-none':''}" data-id="${feed._id}" data-status="active">Start</button>
              <button class="btn btn-warning change-status ${feed.status=='paused'?'d-none':''}" data-id="${feed._id}" data-status="paused">Pause</button>

              <button class="btn btn-danger delete-feed" data-id="${feed._id}">Delete</button>
            </div>
          </li>`);
        });
      },
      error: function(xhr, status, error) {
        alert('Error fetching feeds');
      }
    });
  }
  
  function updateFeeds(){
    $(document).on('click', '.update-feed', function() {
        const id = $(this).data('id');
        // You'd also fetch the current details to populate your form
        // Here's just a simple example of sending the update
        const newName = prompt('Enter the new name for the feed', 'Feed Name'); // Simplification for demonstration
        if (newName) {
          $.ajax({
            type: 'PUT',
            url: `/api/rss/feeds/${id}`,
            data: JSON.stringify({ name: newName }),
            contentType: 'application/json',
            success: function(response) {
              alert('Feed updated successfully');
              listFeeds(); // Refresh the list
            },
            error: function(xhr, status, error) {
              alert(`Error updating feed: ${xhr.responseText}`);
            }
          });
        }
      });
  }

  function deleteFeeds(){
    $(document).on('click', '.delete-feed', function() {
        if (confirm('Are you sure you want to delete this feed?')) {
          const id = $(this).data('id');
          $.ajax({
            type: 'DELETE',
            url: `/api/rss/feeds/${id}`,
            success: function(response) {
              alert('Feed deleted successfully');
              listFeeds(); // Refresh the list
            },
            error: function(xhr, status, error) {
              alert(`Error deleting feed: ${xhr.responseText}`);
            }
          });
        }
      });
      
  }
  function statusFeed() {
    $(document).on('click', '.change-status', function() {
        const feedId = $(this).data('id');
        const newStatus = $(this).data('status');
        $.ajax({
            type: 'PATCH',
            url: `/api/rss/feeds/${feedId}/status`,
            data: JSON.stringify({ status: newStatus }),
            contentType: 'application/json',
            success: function(response) {
              alert(`Feed ${newStatus} successfully`);
              listFeeds(); // Refresh the feed list to reflect the change
            },
            error: function(xhr, status, error) {
              alert(`Error changing feed status: ${xhr.responseText}`);
            }
          });
      });
      

  }
  
  // Manage Articles
  function initiFeedArticles(){
     // Use the utility function to get 'feedId' from the URL
    var feedId = getUrlParameter('feedId');

    // If feedId exists, list articles for that feed
    if(feedId) {
        listArticlesForFeed(feedId);
    }
  }
  function listArticlesForFeed(feedId) {
    $.ajax({
      type: 'GET',
      url: `/api/rss/feeds/${feedId}/articles`,
      success: function(articles) {
        $('#articlesList').empty(); // Clear existing articles
        console.log(articles)
        articles.forEach(article => {
          $('#articlesList').append(`<li class="list-group-item">
            <h5><a href="${article.articleUrl}" target="_blank">${article.title}</a></h5>
            <p>${article.metaDescription.substring(0, 100)}...</p>
            <button class="btn btn-info btn-sm view-article d-none" data-article-id="${article._id}">View</button>
            <a class="btn btn-info btn-sm w-100" href="/dashboard/app/generator/0?articleId=${article._id}">もっと見る</a>
          </li>`);
        });
      },
      error: function(xhr) {
        alert('Failed to fetch articles');
      }
    });
  }
  function viewArticle(){
        // Function to fetch and display a single article for editing
        $(document).on('click', '.view-article', function() {
            const articleId = $(this).data('article-id');
            $.ajax({
              url: `/api/rss/articles/${articleId}`, // Adjust the URL as needed
              method: 'GET',
              success: function(article) {
                $('#articleTitle').val(article.title);
                $('#articleContent').val(article.content);
                $('#generateArticle').attr(`data-id`,article._id)

                // Optionally, update the form action or store the article ID for saving changes
              }
            });
          });
  }

  // Tools
  function getUrlParameter(sParam) {
    const params = new URLSearchParams(window.location.search);
    return params.get(sParam);
  }
