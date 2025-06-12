# server/rag_service/app.py
# ... (imports and setup as before) ...
import os
import sys
from flask import Flask, request, jsonify

current_dir = os.path.dirname(os.path.abspath(__file__))
server_dir = os.path.dirname(current_dir)
sys.path.insert(0, server_dir)

from rag_service import config
import rag_service.file_parser as file_parser
import rag_service.faiss_handler as faiss_handler
import logging

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - [%(name)s:%(lineno)d] - %(message)s')
logger = logging.getLogger(__name__)

app = Flask(__name__)

def create_error_response(message, status_code=500):
    logger.error(f"API Error Response ({status_code}): {message}")
    return jsonify({"error": message}), status_code

@app.route('/health', methods=['GET'])
def health_check():
    # ... (health_check logic as before) ...
    logger.info("\n--- Received request at /health ---")
    status_details = {
        "status": "error",
        "embedding_model_type": config.EMBEDDING_TYPE,
        "embedding_model_name": config.EMBEDDING_MODEL_NAME,
        "embedding_dimension": None,
        "sentence_transformer_load": None,
        "default_index_loaded": False,
        "default_index_vectors": 0,
        "default_index_dim": None,
        "message": ""
    }
    http_status_code = 503
    try:
        model = faiss_handler.embedding_model
        if model is None:
            status_details["message"] = "Embedding model could not be initialized."
            status_details["sentence_transformer_load"] = "Failed"
            raise RuntimeError(status_details["message"])
        else:
            status_details["sentence_transformer_load"] = "OK"
            try: status_details["embedding_dimension"] = faiss_handler.get_embedding_dimension(model)
            except Exception as dim_err: status_details["embedding_dimension"] = f"Error: {dim_err}"
        
        if config.DEFAULT_INDEX_USER_ID in faiss_handler.loaded_indices:
            status_details["default_index_loaded"] = True
            default_index = faiss_handler.loaded_indices[config.DEFAULT_INDEX_USER_ID]
            if hasattr(default_index, 'index') and default_index.index:
                status_details["default_index_vectors"] = default_index.index.ntotal
                status_details["default_index_dim"] = default_index.index.d
        else:
            try:
                default_index = faiss_handler.load_or_create_index(config.DEFAULT_INDEX_USER_ID)
                status_details["default_index_loaded"] = True
                if hasattr(default_index, 'index') and default_index.index:
                    status_details["default_index_vectors"] = default_index.index.ntotal
                    status_details["default_index_dim"] = default_index.index.d
            except Exception as index_load_err:
                status_details["message"] = f"Failed to load default index: {index_load_err}"
                status_details["default_index_loaded"] = False
                raise
        status_details["status"] = "ok"
        status_details["message"] = "RAG service is running, embedding model accessible, default index loaded."
        http_status_code = 200
    except Exception as e:
        logger.error(f"--- Health Check Error ---", exc_info=True)
        if not status_details["message"]: status_details["message"] = f"Health check failed: {str(e)}"
        status_details["status"] = "error"; http_status_code = 503
    return jsonify(status_details), http_status_code


@app.route('/add_document', methods=['POST'])
def add_document():
    # ... (add_document logic mostly as before) ...
    # Ensure original_name (which is stored as documentName in metadata) is used correctly.
    # The existing logic uses data.get('original_name') which is fine.
    logger.info("\n--- Received request at /add_document ---")
    if not request.is_json: return create_error_response("Request must be JSON", 400)
    data = request.get_json()
    user_id = data.get('user_id'); file_path = data.get('file_path'); original_name = data.get('original_name')
    if not all([user_id, file_path, original_name]):
        return create_error_response("Missing user_id, file_path, or original_name", 400)
    if not os.path.exists(file_path): return create_error_response(f"File not found: {file_path}", 404)
    try:
        text_content = file_parser.parse_file(file_path)
        if text_content is None:
            return jsonify({"message": f"File type of '{original_name}' not supported or parsing failed.", "status": "skipped"}), 200
        if not text_content.strip():
            return jsonify({"message": f"No text content extracted from '{original_name}'.", "status": "skipped"}), 200
        
        # Pass original_name as file_name to chunk_text, which stores it as 'documentName'
        documents = file_parser.chunk_text(text_content, original_name, user_id)
        if not documents:
            return jsonify({"message": f"No text chunks generated for '{original_name}'.", "status": "skipped"}), 200
        
        faiss_handler.add_documents_to_index(user_id, documents)
        return jsonify({"message": f"Document '{original_name}' processed.", "status": "added", "chunks_added": len(documents)}), 200
    except Exception as e:
        logger.error(f"--- Add Document Error for '{original_name}' ---", exc_info=True)
        return create_error_response(f"Failed to process '{original_name}': {str(e)}", 500)


@app.route('/query', methods=['POST'])
def query_index_route():
    logger.info("\n--- Received request at /query ---")
    if not request.is_json: return create_error_response("Request must be JSON", 400)

    data = request.get_json()
    user_id = data.get('user_id')
    query = data.get('query')
    k = data.get('k', 5)
    target_original_names = data.get('target_original_names', None) # New: Get target file names

    if not user_id or not query:
        return create_error_response("Missing required fields: user_id, query", 400)
    
    log_msg = f"Querying for user: {user_id} with k={k}"
    if target_original_names:
        log_msg += f", targeting files: {', '.join(target_original_names[:3])}{'...' if len(target_original_names) > 3 else ''}"
    logger.info(log_msg)
    logger.debug(f"Query text: '{query[:100]}...'")

    try:
        # Pass target_original_names to faiss_handler
        results = faiss_handler.query_index(user_id, query, k=k, target_original_names=target_original_names)

        formatted_results = []
        for doc, score in results:
            content = doc.page_content # Full content
            formatted_results.append({
                "documentName": doc.metadata.get("documentName", "Unknown"), # This is originalName
                "score": float(score),
                "content": content,
            })
        logger.info(f"Query successful for user {user_id}. Returning {len(formatted_results)} results.")
        return jsonify({"relevantDocs": formatted_results}), 200
    except Exception as e:
        logger.error(f"--- Query Error ---", exc_info=True)
        return create_error_response(f"Failed to query index: {str(e)}", 500)

if __name__ == '__main__':
    # ... (startup logic as before) ...
    try: faiss_handler.ensure_faiss_dir()
    except Exception as e: logger.critical(f"CRITICAL: Could not create FAISS base directory '{config.FAISS_INDEX_DIR}'. Exiting. Error: {e}", exc_info=True); sys.exit(1)
    try: faiss_handler.get_embedding_model()
    except Exception as e: logger.error(f"CRITICAL: Embedding model failed to initialize: {e}", exc_info=True); sys.exit(1)
    try: faiss_handler.load_or_create_index(config.DEFAULT_INDEX_USER_ID)
    except Exception as e: logger.warning(f"Warning: Could not load/create default index '{config.DEFAULT_INDEX_USER_ID}': {e}", exc_info=True)
    
    port = config.RAG_SERVICE_PORT
    logger.info(f"--- Starting RAG service on http://0.0.0.0:{port} ---")
    logger.info(f"Embedding: {config.EMBEDDING_TYPE} ({config.EMBEDDING_MODEL_NAME})")
    try: logger.info(f"Embedding Dim: {faiss_handler.get_embedding_dimension(faiss_handler.embedding_model)}")
    except: pass
    logger.info(f"FAISS Index Path: {config.FAISS_INDEX_DIR}")
    app.run(host='0.0.0.0', port=port, debug=os.getenv('FLASK_DEBUG') == '1')